# One-off: merges every /custom_files/*.pbf on the spike-valhalla volume into one
# sea-japan-merged.pbf before a tile build. Required because Valhalla's own build pipeline warns
# that feeding `tile_urls` more than one extract is discouraged (crashes with
# `vector::_M_range_check` during the enhance/hierarchy stage on this dataset --
# https://github.com/valhalla/valhalla/issues/3925) and, on this dataset, actually did crash that
# way. Run this against the SAME volume as spike-valhalla (`railway volume detach`/`attach` to
# move it over, see the ADR's rerun command), delete the per-country PBFs it merged afterwards,
# then point spike-valhalla at the single merged file instead of multiple `tile_urls`.
FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends osmium-tool && rm -rf /var/lib/apt/lists/*
WORKDIR /custom_files
CMD ["sh", "-c", "set -e; ls -la /custom_files/*.pbf; osmium merge --overwrite -o /custom_files/merged.pbf /custom_files/*.pbf; ls -la /custom_files/merged.pbf; echo MERGE_DONE"]
