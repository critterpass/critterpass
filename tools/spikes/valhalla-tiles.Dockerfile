# Official Valhalla routing engine image (https://github.com/valhalla/valhalla/pkgs/container/valhalla).
# Its entrypoint builds a tile graph from `tile_urls` into whatever is mounted at /custom_files (the
# image's WORKDIR) on first boot, then serves HTTP on 8002; a populated volume there lets a later
# restart skip rebuilding (`use_tiles_ignore_pbf`, on by default). No repository files are copied in:
# every build/runtime setting comes from Railway service variables (tile_urls, build_elevation,
# server_threads, ...).
#
# Pinned to 3.8.3, not the newer 3.9.0: on 3.9.0 the scripted image's automated pipeline
# (configure_valhalla.sh's `-e build` then `-s enhance` valhalla_build_tiles calls) never produces
# hierarchy levels 0/1, only level 2 -- confirmed on both a single-country extract (clean exit, no
# errors, still zero routable edges) and an 8-country extract (crashes with
# `vector::_M_range_check` during enhance, then loops rebuild/purge/crash). 3.8.3 with the exact
# same tile_urls and Railway setup produces a complete, working graph. Re-check this pin against a
# newer tag before upgrading -- see valhalla/valhalla's own issue tracker for the enhance-stage
# crash class before assuming a later release has fixed it.
FROM ghcr.io/valhalla/valhalla-scripted:3.8.3
