#!/usr/bin/env bash
# Boots Valhalla on the newest published routing tiles. Reads the manifest at
# ROUTING_TILES_MANIFEST_URL, downloads its gzip tile tar when the build differs from the one on
# disk (checksum verified), writes a serving config and runs valhalla_service on port 8002.
# When the manifest can't be read but tiles are on disk (a volume at DATA_DIR), it serves those.
set -euo pipefail

: "${ROUTING_TILES_MANIFEST_URL:?ROUTING_TILES_MANIFEST_URL is required}"
DATA_DIR="${DATA_DIR:-/data}"
THREADS="${VALHALLA_THREADS:-2}"
TILES="$DATA_DIR/valhalla_tiles.tar"
STAMP="$DATA_DIR/tiles-build"

mkdir -p "$DATA_DIR"
current="$(cat "$STAMP" 2>/dev/null || true)"

if manifest="$(curl -fsSL --retry 5 --retry-delay 3 --max-time 60 "$ROUTING_TILES_MANIFEST_URL")"; then
  wanted="$(jq -r '.build' <<<"$manifest")"
  url="$(jq -r '.tiles.url' <<<"$manifest")"
  sha="$(jq -r '.tiles.sha256' <<<"$manifest")"
  if [[ "$wanted" != "$current" || ! -f "$TILES" ]]; then
    echo "routing tiles: downloading $wanted (on disk: ${current:-none})"
    curl -fSL --retry 5 --retry-delay 5 -o "$DATA_DIR/tiles.tar.gz.part" "$url"
    echo "$sha  $DATA_DIR/tiles.tar.gz.part" | sha256sum -c --quiet -
    gunzip -c "$DATA_DIR/tiles.tar.gz.part" >"$TILES.part"
    rm -f "$DATA_DIR/tiles.tar.gz.part"
    mv "$TILES.part" "$TILES"
    echo "$wanted" >"$STAMP"
  fi
  echo "routing tiles: serving $wanted"
elif [[ -f "$TILES" ]]; then
  echo "routing tiles: manifest unreachable, serving ${current:-unknown} from disk"
else
  echo "routing tiles: manifest unreachable and no tiles on disk" >&2
  exit 1
fi

valhalla_build_config \
  --mjolnir-tile-extract "$TILES" \
  --mjolnir-tile-dir "$DATA_DIR/valhalla_tiles" \
  --mjolnir-traffic-extract "" \
  --httpd-service-listen "tcp://*:8002" \
  >"$DATA_DIR/valhalla.json"

exec valhalla_service "$DATA_DIR/valhalla.json" "$THREADS"
