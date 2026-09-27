#!/usr/bin/env bash
# Removes native build output that leaked into apps/mobile/modules/cp-app-group during an earlier
# Android build attempt (that module has no ignore pattern of its own for a bare `android/build`).
set -uo pipefail
cd "$(dirname "$0")/../../../apps/mobile/modules/cp-app-group"
rm -rf android/build
rm -rf android/.cxx
echo "cleaned cp-app-group/android/build and .cxx"
