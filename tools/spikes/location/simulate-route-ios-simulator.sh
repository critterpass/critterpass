#!/usr/bin/env bash
# Rerun: tools/spikes/location/simulate-route-ios-simulator.sh <simulator-udid>
# Feeds tools/spikes/location/sample-dwell-route.gpx into the booted simulator's simulated location
# via `simctl location start` (interpolates between the given waypoints in real time), so the
# location.tsx spike screen's dwell ring can be watched advancing for real.
set -euo pipefail
UDID="${1:?usage: simulate-route-ios-simulator.sh <simulator-udid>}"
GPX="$(dirname "$0")/sample-dwell-route.gpx"

WAYPOINTS=$(python3 - "$GPX" <<'PYEOF'
import sys
import xml.etree.ElementTree as ET
ns = {"g": "http://www.topografix.com/GPX/1/1"}
tree = ET.parse(sys.argv[1])
points = tree.findall(".//g:trkpt", ns)
print(" ".join(f"{p.get('lat')},{p.get('lon')}" for p in points))
PYEOF
)

echo "Waypoints: $WAYPOINTS"
# 1.2 m/s ≈ a slow walk; the route's ~1 km total length plays out over a few minutes.
xcrun simctl location "$UDID" start --speed=1.2 --interval=5 $WAYPOINTS
echo "Route playing on $UDID — open the location.tsx spike screen and watch the dwell ring."
echo "Stop early with: xcrun simctl location $UDID clear"
