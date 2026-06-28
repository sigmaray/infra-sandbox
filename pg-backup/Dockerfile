FROM postgres:16-alpine

RUN apk add --no-cache curl \
  && ARCH="$(uname -m)" \
  && case "${ARCH}" in \
       x86_64) MC_ARCH=amd64 ;; \
       aarch64) MC_ARCH=arm64 ;; \
       *) echo "Unsupported architecture: ${ARCH}" >&2; exit 1 ;; \
     esac \
  && curl -fsSL "https://dl.min.io/client/mc/release/linux-${MC_ARCH}/mc" -o /usr/local/bin/mc \
  && chmod +x /usr/local/bin/mc

COPY backup.sh /backup.sh
COPY entrypoint.sh /entrypoint.sh
COPY crontab /etc/crontabs/root

RUN chmod +x /backup.sh /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
