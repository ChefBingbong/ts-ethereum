# syntax=docker/dockerfile:1.4

FROM grafana/grafana:10.2.0

# Datasource URL is configured with ENV variables
COPY datasource.yml /etc/grafana/provisioning/datasources/datasource.yml

# Dashboard provisioning configuration
COPY dashboard.yml /etc/grafana/provisioning/dashboards/dashboard.yml

# Copy pre-made dashboards
COPY dashboards/ /dashboards/

ENV GF_SECURITY_ADMIN_USER=admin
ENV GF_SECURITY_ADMIN_PASSWORD=admin

# Modified datasource to work with docker network
ENV PROMETHEUS_URL=http://prometheus:9090
ENV DASHBOARDS_DIR=/dashboards

CMD [ \
  "--homepath=/usr/share/grafana", \
  "--packaging=docker", \
  "cfg:default.paths.data=/var/lib/grafana" \
  ]

