#!/usr/bin/env bash
# Rerun: tools/spikes/motion/measure-cold-start-ios-simulator.sh <simulator-udid>
# Records an Xcode Instruments "App Launch" trace around a fresh launch — the Apple-sanctioned way
# to measure iOS cold start (phase-02 names "iOS Instruments" explicitly). Requires a build already
# installed on the given simulator (see tools/spikes/skia-critter/prebuild-and-build-ios-simulator.sh).
#
# Disk warning, found the hard way on this machine: `xctrace record` writes multi-GB raw .ktrace
# files under $TMPDIR *in addition to* the named --output bundle, and without --time-limit it keeps
# recording (observed past 3 GB within ~40 s) until interrupted. A 10 s limit avoided the disk risk
# here but produced a trace too short for `xctrace export` to read ("instrument run data is
# missing") — increase --time-limit on a machine with more headroom rather than dropping it.
set -euo pipefail
UDID="${1:?usage: measure-cold-start-ios-simulator.sh <simulator-udid>}"
BUNDLE_ID="app.critterpass.dev"
OUT="/tmp/cp-motion-cold-start.trace"
TIME_LIMIT="${2:-10s}"

MIN_FREE_GB=6
FREE_GB=$(df -g / | tail -1 | awk '{print $4}')
if [ "$FREE_GB" -lt "$MIN_FREE_GB" ]; then
  echo "BLOCKED: only ${FREE_GB} GB free (need >= ${MIN_FREE_GB} GB)." >&2
  exit 1
fi

cleanup() {
  find "${TMPDIR:-/tmp}" -maxdepth 1 -iname 'instruments*.ktrace' -exec rm -f {} + 2>/dev/null || true
}
trap cleanup EXIT

xcrun simctl terminate "$UDID" "$BUNDLE_ID" 2>/dev/null || true
rm -rf "$OUT"

xcrun xctrace record --template 'App Launch' --time-limit "$TIME_LIMIT" --device "$UDID" --launch "$BUNDLE_ID" --output "$OUT"

echo "Trace recorded at $OUT"
echo "Open it in Instruments.app for the Time to First Frame / Time to Initial Display metrics,"
echo "or export a text summary (fails if --time-limit was too short to finish one full launch):"
echo "  xcrun xctrace export --input '$OUT' --toc"
