#!/usr/bin/env bash
# Publishes a device run's images to a pull request (or an issue: the nightly sweep's).
#
#   tools/scripts/ci-device/publish-screenshots.sh <pr or issue> <images dir> <heading>
#
# Pushes every PNG under <images dir> (kept in its subfolders, e.g. ios/, android/, ios-sheets/) to
# the orphan `screenshots` branch under <pr>/run-<run id>/ (never merged into main; a fresh folder
# per run so raw.githubusercontent.com never serves a cached older image), then posts one PR comment
# embedding them. Needs GH_TOKEN (contents: write, issues: write, pull-requests: write),
# GITHUB_REPOSITORY and GITHUB_RUN_ID; set RUN_URL to link the run and SUMMARY_FILE to put a
# markdown summary (the run's check findings) above the images.
set -euo pipefail

pr=$1
images=$(cd "$2" && pwd)
heading=$3
repo=${GITHUB_REPOSITORY:?}
run_dir="$pr/run-${GITHUB_RUN_ID:?}"
branch=screenshots
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

remote="https://x-access-token:${GH_TOKEN:?}@github.com/$repo.git"
if git ls-remote --exit-code --heads "$remote" "$branch" >/dev/null 2>&1; then
  git clone -q --depth 1 --branch "$branch" "$remote" "$work/branch"
else
  git init -q -b "$branch" "$work/branch"
  git -C "$work/branch" remote add origin "$remote"
  printf '# PR screenshots\n\nImages embedded in pull request comments. Not part of the app.\n' \
    >"$work/branch/README.md"
fi
cd "$work/branch"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

mkdir -p "$run_dir"
(cd "$images" && find . -name '*.png' -print0 | xargs -0 -I{} rsync -R {} "$work/branch/$run_dir/")
count=$(find "$run_dir" -name '*.png' | wc -l | tr -d ' ')
summary=${SUMMARY_FILE:-}
[ -n "$summary" ] && [ ! -s "$summary" ] && summary=''
if [ "$count" = 0 ] && [ -z "$summary" ]; then
  echo "No images to publish"
  exit 0
fi
if [ "$count" != 0 ]; then
  git add -A
  git commit -q -m "docs: device run screenshots for #$pr"
  for attempt in 1 2 3; do
    git push -q origin "$branch" && break
    [ "$attempt" = 3 ] && exit 1
    git pull -q --rebase origin "$branch"
  done
fi

body="$work/comment.md"
{
  echo "## $heading"
  echo
  [ -n "${RUN_URL:-}" ] && echo "From [this run]($RUN_URL), $count image(s)." && echo
  [ -n "$summary" ] && cat "$summary" && echo
  for folder in $(find "$run_dir" -name '*.png' -exec dirname {} \; | sort -u); do
    echo "<details open><summary><b>${folder#"$run_dir"/}</b></summary>"
    echo
    for file in $(find "$folder" -maxdepth 1 -name '*.png' | sort); do
      name=$(basename "$file" .png)
      echo "**$name**"
      echo
      echo "<img src=\"https://raw.githubusercontent.com/$repo/$branch/$file\" width=\"320\" alt=\"$name\">"
      echo
    done
    echo "</details>"
    echo
  done
} >"$body"
# A comment holds at most 65536 characters: past that, embed only the index sheets and link the rest.
if [ "$(wc -c <"$body")" -gt 64000 ]; then
  {
    echo "## $heading"
    echo
    [ -n "${RUN_URL:-}" ] && echo "From [this run]($RUN_URL), $count image(s)." && echo
    [ -n "$summary" ] && head -c 40000 "$summary" && echo
    echo "Every image: https://github.com/$repo/tree/$branch/$run_dir"
    echo
    for file in $(find "$run_dir" -name 'index.png' | sort); do
      echo "<img src=\"https://raw.githubusercontent.com/$repo/$branch/$file\" width=\"720\" alt=\"$file\">"
      echo
    done
  } >"$body"
fi
# `gh issue comment` posts to pull requests too.
gh issue comment "$pr" --repo "$repo" --body-file "$body"
echo "Published $count image(s) to #$pr"
