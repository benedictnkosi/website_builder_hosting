#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/env.sh"

if ! command -v "$CADDY_COMMAND" >/dev/null 2>&1; then
  echo "Caddy is not installed. Install it first, for example:" >&2
  echo "  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl" >&2
  echo "  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg" >&2
  echo "  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list" >&2
  echo "  sudo apt-get update && sudo apt-get install -y caddy" >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Caddy needs root (or CAP_NET_BIND_SERVICE) to listen on port 80." >&2
  echo "Re-run as: sudo $0" >&2
  exit 1
fi

mkdir -p "$(dirname "$CADDY_CONFIG")" "$CADDY_SITES_AVAILABLE" "$CADDY_SITES_ENABLED" "$WEB_ROOT"

if [ ! -f "$CADDY_CONFIG" ]; then
  cat > "$CADDY_CONFIG" <<EOF
{
	auto_https off
	http_port 80
}

import ${CADDY_SITES_ENABLED}/*
EOF
  echo "Wrote initial Caddyfile at $CADDY_CONFIG"
fi

echo "Starting Caddy with $CADDY_CONFIG"
exec "$CADDY_COMMAND" run --config "$CADDY_CONFIG"
