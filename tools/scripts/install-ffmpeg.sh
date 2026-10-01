#!/usr/bin/env bash
# Installs ffmpeg from the Ubuntu archive on a GitHub runner, as the worker image has it, for the
# worker's media and voice-note suites.
#
#   tools/scripts/install-ffmpeg.sh
#
# The package mirrors sometimes stall for ten minutes and more: fetching the lists and the packages
# gets three minutes a try, three tries, with apt's own retries and a 30 s read timeout. The install
# then runs from what was fetched, so dpkg is never cut off halfway.
set -euo pipefail

apt=(apt-get -qq -o Acquire::Retries=3 -o Acquire::http::Timeout=30)
for attempt in 1 2 3; do
  if sudo timeout 180 "${apt[@]}" update &&
    sudo timeout 180 "${apt[@]}" install -y --no-install-recommends --download-only ffmpeg; then
    sudo "${apt[@]}" install -y --no-install-recommends ffmpeg
    exit 0
  fi
  echo "::warning::Fetching ffmpeg failed or stalled (try $attempt of 3)"
done
exit 1
