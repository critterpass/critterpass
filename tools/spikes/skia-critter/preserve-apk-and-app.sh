#!/usr/bin/env bash
# Copies just the built APK / .app bundle (small) out of the heavy, regenerable native output trees
# (large .cxx/intermediates) into /tmp, so those trees can be deleted to free disk without forcing a
# full native rebuild for later spike passes.
set -uo pipefail
cd "$(dirname "$0")/../../../apps/mobile"

mkdir -p /tmp/cp-spike-artifacts
APK=$(find android/app/outputs -iname 'app-debug.apk' 2>/dev/null | head -1)
if [ -n "$APK" ]; then
  cp "$APK" /tmp/cp-spike-artifacts/critterpass-dev-debug.apk
  echo "Saved APK: /tmp/cp-spike-artifacts/critterpass-dev-debug.apk ($(du -h "$APK" | cut -f1))"
else
  echo "No app-debug.apk found under android/app/outputs"
fi

APP=$(find /tmp/cp-skia-critter-ios-derived/Build/Products -maxdepth 2 -iname 'CritterpassDev.app' 2>/dev/null | head -1)
if [ -n "$APP" ]; then
  rm -rf /tmp/cp-spike-artifacts/CritterpassDev.app
  cp -R "$APP" /tmp/cp-spike-artifacts/CritterpassDev.app
  echo "Saved app: /tmp/cp-spike-artifacts/CritterpassDev.app ($(du -sh /tmp/cp-spike-artifacts/CritterpassDev.app | cut -f1))"
else
  echo "No CritterpassDev.app found under DerivedData"
fi

du -sh /tmp/cp-spike-artifacts/* 2>/dev/null
