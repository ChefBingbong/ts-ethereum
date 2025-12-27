FROM prom/prometheus:latest

COPY prometheus.yml /etc/prometheus/prometheus.yml
COPY --chown=nobody:nobody entrypoint.sh /etc/prometheus/entrypoint.sh
RUN chmod +x /etc/prometheus/entrypoint.sh

# Default execution client URL (can be overridden via environment variable)
ENV EXECUTION_CLIENT_URL='execution-client:9400'

VOLUME /prometheus

ENTRYPOINT ["/etc/prometheus/entrypoint.sh"]

CMD [ \
  "--config.file=/etc/prometheus/prometheus.yml", \
  "--storage.tsdb.path=/prometheus" \
  ]


