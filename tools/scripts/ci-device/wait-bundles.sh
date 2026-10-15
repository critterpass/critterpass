#!/usr/bin/env bash
# Waits for this run's exported JS (the `bundles` job's `device-bundles` artifact) and downloads it
# into <dir>, so a shard boots its simulator or emulator while the JS is still being exported.
#
#   tools/scripts/ci-device/wait-bundles.sh <dir>
#
# Needs GH_TOKEN (actions: read), GITHUB_REPOSITORY and GITHUB_RUN_ID. Gives up after 20 minutes,
# or at once when the bundles job has failed.
set -euo pipefail

dest=$1
run=${GITHUB_RUN_ID:?}
repo=${GITHUB_REPOSITORY:?}
for _ in $(seq 1 240); do
  if [ -n "$(gh api "repos/$repo/actions/runs/$run/artifacts" --jq '.artifacts[] | select(.name == "device-bundles") | .id')" ]; then
    mkdir -p "$dest"
    gh run download "$run" --repo "$repo" --name device-bundles --dir "$dest"
    echo "[$(date -u +%H:%M:%S)] this run's JS bundles are in $dest"
    exit 0
  fi
  failed=$(gh api "repos/$repo/actions/runs/$run/jobs" --paginate \
    --jq '.jobs[] | select(.name | startswith("bundles")) | select(.conclusion == "failure" or .conclusion == "cancelled") | .name')
  if [ -n "$failed" ]; then
    echo "::error title=No JS bundles::the bundles job did not finish ($failed)"
    exit 1
  fi
  sleep 5
done
echo "::error title=No JS bundles::this run's JS bundles never arrived"
exit 1
