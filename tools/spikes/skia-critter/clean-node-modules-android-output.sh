#!/usr/bin/env bash
# Deletes Gradle build/.cxx output that leaked inside node_modules native-module packages (e.g.
# react-native-reanimated, @shopify/react-native-skia) during an Android build — each package's own
# `android/build` and `android/.cxx` are regenerable and pnpm/Gradle recreate them on the next build.
set -uo pipefail
cd "$(dirname "$0")/../../.."

echo "Before cleanup:"; df -h / | tail -1
BEFORE=$(du -sh node_modules 2>/dev/null | cut -f1)

find node_modules/.pnpm -maxdepth 6 -type d -path "*/android/build" -exec rm -rf {} + 2>/dev/null
find node_modules/.pnpm -maxdepth 6 -type d -path "*/android/.cxx" -exec rm -rf {} + 2>/dev/null

AFTER=$(du -sh node_modules 2>/dev/null | cut -f1)
echo "node_modules: $BEFORE -> $AFTER"
echo "After cleanup:"; df -h / | tail -1
