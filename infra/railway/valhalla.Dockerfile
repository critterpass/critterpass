# Valhalla for Railway: the public 3.8.3 image (3.9.0 builds no usable graph, see
# docs/decisions/20260927-valhalla-routing-on-railway.md) serving the newest tiles that
# .github/workflows/routing-tiles.yml publishes. Nothing is built into the image but the boot script.
# Build context: repository root, or any folder holding tools/routing-tiles/serve.sh.
FROM ghcr.io/valhalla/valhalla-scripted:3.8.3
COPY tools/routing-tiles/serve.sh /valhalla/serve.sh
EXPOSE 8002
ENTRYPOINT ["/bin/bash", "/valhalla/serve.sh"]
