# Website Deployment Agent

A secure Spring Boot deployment agent that receives static websites from Lulaweb, writes files to the filesystem, manages Caddy site configuration, validates the configuration, and reloads Caddy.

## Architecture

```text
Lulaweb
        |
        | HTTPS + API key
        v
Website Deployment Agent
        |
        ├── /var/www/sites
        |
        └── Caddy
```

## What it does

1. Accepts a deployment request with a domain and static files (`index.html`, `styles.css`, `script.js`, and optional assets).
2. Validates the domain and every file path to prevent path traversal and command injection.
3. Writes files to a temporary deployment directory.
4. Generates a Caddy site block programmatically (never from user-supplied config).
5. Stages the configuration, runs `caddy validate --config ...`, and only then finalizes the configuration.
6. Atomically activates the website directory.
7. Reloads Caddy with `caddy reload --config ...`.

If any step fails, temporary files are cleaned up and invalid Caddy configuration is not left active.

## Requirements

- Java 21
- Maven 3.9+

For local development, Caddy is **not** required for unit tests. Default paths use `/tmp/website-agent/...`.

To actually serve sites locally, install Caddy (`brew install caddy`) and run it against the generated Caddyfile.

## Linux server (Hostwinds)

After cloning the repo on the VPS:

```bash
sudo apt-get update
sudo apt-get install -y openjdk-21-jdk maven
# install Caddy from https://caddyserver.com/docs/install#debian-ubuntu-raspbian

cd website-deployment-agent
cp .env.example .env
# edit .env and set DEPLOYMENT_API_KEY

# terminal 1
sudo ./scripts/start-caddy.sh

# terminal 2
./scripts/start-springboot.sh
```

Point DNS A records at the VPS public IP, then deploy with a domain from Lulaweb.

## Run locally

```bash
cd website-deployment-agent
mvn spring-boot:run
```

In another terminal, start Caddy (port 80 may require sudo):

```bash
caddy run --config /tmp/website-agent/caddy/Caddyfile
```

Health check (no authentication):

```bash
curl http://localhost:8080/api/v1/health
```

## Configuration

Configuration is in `src/main/resources/application.yml`.

| Property | Environment variable | Default (local) |
|---|---|---|
| `deployment.web-root` | `WEB_ROOT` | `/tmp/website-agent/sites` |
| `deployment.caddy-config` | `CADDY_CONFIG` | `/tmp/website-agent/caddy/Caddyfile` |
| `deployment.caddy-sites-available` | `CADDY_SITES_AVAILABLE` | `/tmp/website-agent/caddy/sites-available` |
| `deployment.caddy-sites-enabled` | `CADDY_SITES_ENABLED` | `/tmp/website-agent/caddy/sites-enabled` |
| `deployment.caddy-command` | `CADDY_COMMAND` | `caddy` |
| `deployment.enable-https` | `CADDY_ENABLE_HTTPS` | `false` |
| `deployment.acme-email` | `CADDY_ACME_EMAIL` | empty |
| `deployment.public-ip` | `PUBLIC_IP` | empty |
| `deployment.https-retry-ms` | `HTTPS_RETRY_MS` | `30000` |
| `deployment.max-file-size-bytes` | `MAX_FILE_SIZE_BYTES` | `2097152` (2 MB) |
| `deployment.max-total-size-bytes` | `MAX_TOTAL_SIZE_BYTES` | `10485760` (10 MB) |
| `security.api-key` | `DEPLOYMENT_API_KEY` | `development-key` |
| `server.port` | `SERVER_PORT` | `8080` |

### Production example

```bash
export WEB_ROOT=/var/www/sites
export CADDY_CONFIG=/etc/caddy/Caddyfile
export CADDY_SITES_AVAILABLE=/etc/caddy/sites-available
export CADDY_SITES_ENABLED=/etc/caddy/sites-enabled
export CADDY_COMMAND=/usr/bin/caddy
export CADDY_ENABLE_HTTPS=true
export PUBLIC_IP=104.168.134.8
export DEPLOYMENT_API_KEY=your-secure-random-key
```

## API endpoints

### `GET /api/v1/health`

Public health check.

```json
{ "status": "UP" }
```

### `POST /api/v1/deploy`

Requires header: `Authorization: Bearer <API_KEY>`

### `GET /api/v1/sites/{domain}`

Requires API key. Returns whether the site exists and its deployment directory.

### `DELETE /api/v1/sites/{domain}`

Requires API key. Removes the website files and Caddy configuration.

## Example deployment request

```bash
curl -X POST http://localhost:8080/api/v1/deploy \
  -H "Authorization: Bearer development-key" \
  -H "Content-Type: application/json" \
  -d '{
    "websiteId": "12345",
    "domain": "thandoplumbing.co.za",
    "files": [
      { "path": "index.html", "content": "<!DOCTYPE html><html><body>Hello</body></html>" },
      { "path": "styles.css", "content": "body { font-family: sans-serif; }" },
      { "path": "script.js", "content": "console.log(\"ready\");" }
    ]
  }'
```

Success response:

```json
{
  "success": true,
  "websiteId": "12345",
  "domain": "thandoplumbing.co.za",
  "httpsReady": false,
  "message": "Website deployed. HTTPS will be enabled once public DNS points at this server."
}
```

Error response format:

```json
{
  "success": false,
  "error": "INVALID_DOMAIN",
  "message": "The supplied domain is invalid"
}
```

Caddy-specific errors:

```text
CADDY_VALIDATION_FAILED
CADDY_RELOAD_FAILED
```

## Linux server setup

1. Install Java 21 and Caddy, then create directories:

```bash
sudo mkdir -p /var/www/sites
sudo mkdir -p /etc/caddy/sites-available /etc/caddy/sites-enabled
```

2. The agent writes the main Caddyfile and imports enabled sites:

```text
{
    auto_https off
    http_port 80
}

import /etc/caddy/sites-enabled/*
```

Each deployed domain gets a file such as `/etc/caddy/sites-available/thandoplumbing.co.za.caddy` and a symlink in `sites-enabled`.

3. Run Caddy with that Caddyfile (systemd example below).

4. Create a dedicated system user for the agent with write access to `/var/www/sites` and the Caddy site directories.

5. Point DNS A records for customer domains to the server IP.

## HTTPS for new domain registrations

Caddy must not request a Let's Encrypt certificate until public DNS for both the apex and `www` resolve to this server. New `.co.za` names are often NXDOMAIN for several minutes after registration. If ACME runs then, it fails, Caddy can get stuck, and browsers show `ERR_SSL_PROTOCOL_ERROR`.

Set `PUBLIC_IP` to the VPS IPv4 address. On deploy:

1. Files are written immediately.
2. If DNS is not ready, the site is bound as `http://` only (no ACME).
3. Every 30 seconds the agent checks Google/Cloudflare DNS. When apex and `www` point at `PUBLIC_IP`, it switches the site to HTTPS (Let's Encrypt only, no ZeroSSL fallback) and reloads Caddy.

Redeploys of a site that already has HTTPS keep HTTPS even if DNS blips.

## Security considerations

- **API key authentication** on all endpoints except `/api/v1/health`.
- **Constant-time API key comparison** to reduce timing attacks.
- **Domain validation** rejects localhost, IP addresses, path traversal, and shell/Caddyfile metacharacters.
- **File path validation** uses Java NIO `resolve().normalize()` and verifies paths stay inside the website root.
- **No shell execution** — commands use `ProcessBuilder` with fixed binary paths from configuration.
- **No user-supplied Caddy configuration** — configuration is generated from validated domain data only.
- **Atomic deployments** — files are written to a temporary directory and activated only after Caddy validation succeeds.
- **Size limits** — configurable caps on file count, individual file size, and total deployment size.
- **Logging** — deployment events are logged; API keys and full HTML/JS content are not logged.

## Install as a systemd service

Create `/etc/systemd/system/website-deployment-agent.service`:

```ini
[Unit]
Description=Website Deployment Agent
After=network.target caddy.service

[Service]
User=deploy-agent
Group=deploy-agent
WorkingDirectory=/opt/website-deployment-agent
Environment=WEB_ROOT=/var/www/sites
Environment=CADDY_CONFIG=/etc/caddy/Caddyfile
Environment=CADDY_SITES_AVAILABLE=/etc/caddy/sites-available
Environment=CADDY_SITES_ENABLED=/etc/caddy/sites-enabled
Environment=CADDY_ENABLE_HTTPS=true
Environment=PUBLIC_IP=104.168.134.8
Environment=DEPLOYMENT_API_KEY=change-me
ExecStart=/usr/bin/java -jar /opt/website-deployment-agent/website-deployment-agent.jar
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Build the JAR:

```bash
mvn clean package
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable website-deployment-agent
sudo systemctl start website-deployment-agent
```

## Testing

```bash
mvn clean test
```

Tests cover domain validation, file path security, Caddy configuration generation, and deployment orchestration with mocked filesystem and process execution.

## Project structure

```text
src/main/java/com/webhosting/deploymentagent/
├── controller/       # REST endpoints
├── service/          # Deployment, file, Caddy, and domain logic
├── model/            # Request/response DTOs
├── exception/        # Errors and global handler
├── security/         # API key filter and security config
├── config/           # Configuration properties
└── util/             # Process execution and path validation
```

## Future extensions

The deployment service is structured so HTTPS (Caddy automatic certificates), DNS management, and additional integrations can be added later without rewriting the core deployment flow.
