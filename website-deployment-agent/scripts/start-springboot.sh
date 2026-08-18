#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/env.sh"

cd "$AGENT_HOME"

if ! command -v java >/dev/null 2>&1; then
  echo "Java is not installed. On Ubuntu/Debian: sudo apt-get install -y openjdk-21-jdk" >&2
  exit 1
fi

java_version="$(java -version 2>&1 | awk -F[\".] '/version/ { print $2; exit }')"
if [ "$java_version" != "21" ]; then
  echo "Java 21 is required. Found Java ${java_version:-unknown}." >&2
  exit 1
fi

mkdir -p "$WEB_ROOT" "$CADDY_SITES_AVAILABLE" "$CADDY_SITES_ENABLED"

for dir in "$WEB_ROOT" "$CADDY_SITES_AVAILABLE" "$CADDY_SITES_ENABLED"; do
  if [ ! -w "$dir" ]; then
    echo "Cannot write to $dir. Re-run as root or chown that directory to $(id -un)." >&2
    exit 1
  fi
done

if [ ! -f "$JAR_PATH" ]; then
  if ! command -v mvn >/dev/null 2>&1; then
    echo "Maven is not installed and $JAR_PATH is missing." >&2
    echo "Install Maven (sudo apt-get install -y maven) or copy a built jar to $JAR_PATH" >&2
    exit 1
  fi
  echo "Building website-deployment-agent..."
  mvn -q -DskipTests package
fi

if [ ! -f "$JAR_PATH" ]; then
  echo "Expected jar not found at $JAR_PATH" >&2
  exit 1
fi

echo "Starting Spring Boot agent on port $SERVER_PORT"
echo "WEB_ROOT=$WEB_ROOT"
echo "CADDY_CONFIG=$CADDY_CONFIG"

exec java -jar "$JAR_PATH"
