# Valhalla for Railway: the public 3.8.3 image (3.9.0 builds no usable graph, see
# docs/decisions/20260927-valhalla-routing-on-railway.md) serving the newest tiles that
# .github/workflows/routing-tiles.yml publishes. Nothing is built into the image but the boot script.
# Build context: repository root, or any folder holding tools/routing-tiles/serve.sh.
FROM ghcr.io/valhalla/valhalla-scripted:3.8.3
# The upstream image has no unprivileged user of its own.
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin valhalla
COPY tools/routing-tiles/serve.sh /valhalla/serve.sh
EXPOSE 8002
# Railway mounts the tiles volume owned by root, so the container starts as root only to hand
# DATA_DIR (and whatever an earlier root boot left in it) to `valhalla`, then drops to that user
# for the download, the config and the server. There is deliberately no `USER` line: with one,
# nothing could take ownership of the volume and the boot script could not write to it.
ENTRYPOINT ["/bin/bash", "-c", "set -e; d=\"${DATA_DIR:-/data}\"; mkdir -p \"$d\"; chown -R valhalla:valhalla \"$d\"; exec setpriv --reuid=valhalla --regid=valhalla --init-groups /bin/bash /valhalla/serve.sh"]
