#!/usr/bin/env bash
# Shared environment for the deployment agent and Caddy on Linux.
# Override any value in website-deployment-agent/.env or by exporting it first.

AGENT_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$AGENT_HOME/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$AGENT_HOME/.env"
  set +a
fi

export WEB_ROOT="${WEB_ROOT:-/var/www/sites}"
export CADDY_CONFIG="${CADDY_CONFIG:-/etc/caddy/Caddyfile}"
export CADDY_SITES_AVAILABLE="${CADDY_SITES_AVAILABLE:-/etc/caddy/sites-available}"
export CADDY_SITES_ENABLED="${CADDY_SITES_ENABLED:-/etc/caddy/sites-enabled}"
export CADDY_COMMAND="${CADDY_COMMAND:-caddy}"
export CADDY_ENABLE_HTTPS="${CADDY_ENABLE_HTTPS:-true}"
export CADDY_ACME_EMAIL="${CADDY_ACME_EMAIL:-}"
export SERVER_PORT="${SERVER_PORT:-8080}"
export DEPLOYMENT_API_KEY="${DEPLOYMENT_API_KEY:-development-key}"
export JAR_PATH="${JAR_PATH:-$AGENT_HOME/target/website-deployment-agent-0.1.0-SNAPSHOT.jar}"
