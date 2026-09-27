#!/usr/bin/env bash
# Founder device-bench capture for the sticker lab (apps/mobile/src/app/(dev)/sticker-lab.tsx).
# Real fps/memory numbers only come from physical hardware — the Maestro flow
# (e2e/critters/sticker-lab.yaml) only proves the lab doesn't crash on a simulator/emulator.
#
# Usage:
#   e2e/critters/capture-perf.sh android [package-id]   # defaults to app.critterpass.dev
#   e2e/critters/capture-perf.sh ios <device-udid>
#
# Both subcommands assume the dev-client build is already installed and running, and that you've
# navigated to Developer tools -> Sticker lab and are about to scroll/trigger draw-ons by hand.
set -euo pipefail

usage() {
  echo "usage: $0 android [package-id] | ios <device-udid>" >&2
  exit 1
}

capture_android() {
  local package="${1:-app.critterpass.dev}"
  echo "Resetting gfxinfo stats for ${package}..."
  adb shell dumpsys gfxinfo "${package}" reset >/dev/null

  echo "Now scroll the sticker lab grid, trigger both hero draw-ons, and toggle the closed-eye"
  echo "storm on the device. Press Enter here when done."
  read -r _

  echo "=== dumpsys gfxinfo (frame timing / jank) ==="
  adb shell dumpsys gfxinfo "${package}"
  echo
  echo "=== dumpsys meminfo (PSS, incl. the sticker cache's native + JS heap) ==="
  adb shell dumpsys meminfo "${package}"
}

capture_ios() {
  local udid="${1:?ios capture needs a device UDID — run \`xcrun xctrace list devices\` to find it}"
  local outdir
  outdir="$(mktemp -d)"

  echo "Recording Animation Hitches for 30s on device ${udid} — scroll the grid, trigger both hero"
  echo "draw-ons, and toggle the closed-eye storm now."
  xcrun xctrace record \
    --device "${udid}" \
    --template 'Animation Hitches' \
    --time-limit 30s \
    --output "${outdir}/sticker-lab-hitches.trace" \
    --all-processes

  echo "Recording Allocations for 15s — repeat the closed-eye storm toggle a few times to see peak"
  echo "sticker cache memory."
  xcrun xctrace record \
    --device "${udid}" \
    --template 'Allocations' \
    --time-limit 15s \
    --output "${outdir}/sticker-lab-allocations.trace" \
    --all-processes

  echo "Traces written to ${outdir} — open both in Instruments.app (\`open ${outdir}/*.trace\`)."
}

case "${1:-}" in
  android) capture_android "${2:-}" ;;
  ios) capture_ios "${2:-}" ;;
  *) usage ;;
esac
