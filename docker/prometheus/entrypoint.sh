#!/bin/sh
set -e

# Replace placeholder in prometheus.yml with actual execution client URL
EXECUTION_CLIENT_URL=${EXECUTION_CLIENT_URL:-execution-client:9400}

sed -i "s|#EXECUTION_CLIENT_URL|${EXECUTION_CLIENT_URL}|g" /etc/prometheus/prometheus.yml

# Execute prometheus with all arguments
exec /bin/prometheus "$@"

