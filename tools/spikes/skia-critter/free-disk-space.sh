#!/usr/bin/env bash
# Stops native-build daemons/emulators and deletes regenerable native build output. Safe to rerun
# any time — everything this touches is git-ignored and rebuildable from prebuild-and-*.sh.
set -uo pipefail
cd "$(dirname "$0")/../../../apps/mobile"

echo "Before cleanup:"; df -h / | tail -1

if [ -f android/gradlew ]; then
  (cd android && ./gradlew --stop) || true
fi
pkill -f GradleDaemon 2>/dev/null || true
pkill -f KotlinCompileDaemon 2>/dev/null || true

rm -rf android/app/.cxx
rm -rf android/app/build
rm -rf android/build
rm -rf android/.gradle
rm -rf ios
rm -rf /tmp/cp-skia-critter-ios-derived
rm -rf ~/.gradle/caches/*/transforms-3
rm -rf ~/.gradle/caches/build-cache-1

echo "After cleanup:"; df -h / | tail -1
