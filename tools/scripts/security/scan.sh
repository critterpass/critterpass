#!/usr/bin/env bash
# Security scans before launch and after any advisory: secrets in git history and recent CI logs,
# dependency advisories (pnpm audit + OSV) and container/Dockerfile misconfiguration.
#
#   bash tools/scripts/security/scan.sh                 # every step
#   bash tools/scripts/security/scan.sh secrets deps    # only the named steps
#   CI_RUNS=50 SCAN_IMAGES="ghcr.io/x/api:sha" bash tools/scripts/security/scan.sh containers ci-logs
#
# Steps: secrets, ci-logs, deps, osv, containers, plus `tracked` (secrets in the files tracked at
# HEAD only, for a clone without full history) when named. Each uses the native binary when installed and
# falls back to its pinned Docker image. Findings are printed redacted; the exit code is non-zero
# when any step finds something or cannot run. Results go into docs/compliance/security-review.md.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT" || exit 2

GITLEAKS_IMAGE="ghcr.io/gitleaks/gitleaks:v8.30.1"
OSV_IMAGE="ghcr.io/google/osv-scanner:v2.6.0"
TRIVY_IMAGE="aquasec/trivy:0.75.0"
CI_RUNS="${CI_RUNS:-30}"
STEPS=("$@")
[ ${#STEPS[@]} -eq 0 ] && STEPS=(secrets ci-logs deps osv containers)

failed=()
passed=()

have() { command -v "$1" >/dev/null 2>&1; }
docker_up() { have docker && docker info >/dev/null 2>&1; }

# run_tool <binary> <image> <mount> <args...>: native when present, else the image with $ROOT at <mount>.
run_tool() {
  local bin="$1" image="$2" mount="$3"
  shift 3
  if have "$bin"; then
    "$bin" "$@"
  elif docker_up; then
    local args=()
    for arg in "$@"; do args+=("${arg//$ROOT/$mount}"); done
    docker run --rm -v "$ROOT:$mount" "$image" "${args[@]}"
  else
    echo "  $bin is not installed and Docker is not running" >&2
    return 3
  fi
}

step_secrets() {
  run_tool gitleaks "$GITLEAKS_IMAGE" /repo git "$ROOT" --config "$ROOT/.gitleaks.toml" \
    --redact --no-banner --exit-code 1
}

# Only the files tracked at HEAD, exported to a scratch directory: no history walk, so it is safe
# on a partial clone, and ignored files (node_modules, .env) are never read.
step_tracked() {
  local dir
  dir="$(mktemp -d "$ROOT/.scan-tracked.XXXXXX")"
  trap 'rm -rf "$dir"' RETURN
  git archive HEAD | tar -x -C "$dir" || return 3
  # .gitleaksignore names findings by commit; a directory scan names them by path, so the same
  # accepted findings are rewritten without the commit (native and container path forms).
  local accepted
  accepted="$(sed -n -E 's/^[0-9a-f]{40}:(.+)$/\1/p' .gitleaksignore 2>/dev/null)"
  {
    printf '%s\n' "$accepted" | sed "s|^|$dir/|"
    printf '%s\n' "$accepted" | sed "s|^|/repo/${dir#"$ROOT"/}/|"
  } >"$dir/.gitleaksignore"
  echo "  scanning $(git ls-files | wc -l | tr -d ' ') tracked files"
  run_tool gitleaks "$GITLEAKS_IMAGE" /repo dir "$dir" --config "$ROOT/.gitleaks.toml" \
    --gitleaks-ignore-path "$dir" --redact --no-banner --exit-code 1
}

step_ci_logs() {
  have gh || { echo "  gh is not installed" >&2; return 3; }
  local dir
  dir="$(mktemp -d "$ROOT/.scan-ci-logs.XXXXXX")"
  trap 'rm -rf "$dir"' RETURN
  local ids
  ids="$(gh run list --limit "$CI_RUNS" --json databaseId --jq '.[].databaseId')" || return 3
  for id in $ids; do
    gh run view "$id" --log >"$dir/$id.log" 2>/dev/null || true
  done
  echo "  scanning logs of $(find "$dir" -name '*.log' -size +0 | wc -l | tr -d ' ') runs"
  run_tool gitleaks "$GITLEAKS_IMAGE" /repo dir "$dir" --config "$ROOT/.gitleaks.toml" \
    --redact --no-banner --exit-code 1
}

# Advisories accepted in osv-scanner.toml (each with its reason) are the single accepted list.
# Filtered here rather than with `pnpm audit --ignore`, which writes them into pnpm-workspace.yaml.
step_deps() {
  local accepted
  accepted="$(sed -n 's/^id = "\(GHSA-[^"]*\)"/\1/p' osv-scanner.toml | tr '\n' ' ')"
  local report
  # pnpm audit exits non-zero whenever it finds anything; the filter below decides.
  report="$(pnpm audit --audit-level high --json 2>/dev/null)"
  [ -n "$report" ] || { echo "  pnpm audit returned nothing" >&2; return 3; }
  printf '%s' "$report" | ACCEPTED="$accepted" node -e '
    let raw = "";
    process.stdin.on("data", (c) => (raw += c)).on("end", () => {
      const accepted = new Set(process.env.ACCEPTED.split(" ").filter(Boolean));
      const open = Object.values(JSON.parse(raw).advisories ?? {}).filter(
        (a) => ["high", "critical"].includes(a.severity) && !accepted.has(a.github_advisory_id),
      );
      for (const a of open) console.log(`  ${a.severity} ${a.module_name} ${a.github_advisory_id} ${a.title}`);
      console.log(`  ${open.length} open high/critical advisories (${accepted.size} accepted)`);
      process.exit(open.length === 0 ? 0 : 1);
    });'
}

step_osv() {
  run_tool osv-scanner "$OSV_IMAGE" /src scan source --lockfile="$ROOT/pnpm-lock.yaml"
}

step_containers() {
  local status=0
  local files=(services/api/Dockerfile services/worker/Dockerfile infra/railway/*.Dockerfile)
  for file in "${files[@]}"; do
    [ -f "$file" ] || continue
    echo "  config: $file"
    run_tool trivy "$TRIVY_IMAGE" /src config --exit-code 1 --severity HIGH,CRITICAL "$ROOT/$file" ||
      status=$?
  done
  for image in ${SCAN_IMAGES:-}; do
    echo "  image: $image"
    if have trivy; then
      trivy image --exit-code 1 --severity HIGH,CRITICAL --ignore-unfixed "$image" || status=$?
    elif docker_up; then
      docker run --rm -v /var/run/docker.sock:/var/run/docker.sock "$TRIVY_IMAGE" image \
        --exit-code 1 --severity HIGH,CRITICAL --ignore-unfixed "$image" || status=$?
    else
      echo "  trivy is not installed and Docker is not running" >&2
      status=3
    fi
  done
  return "$status"
}

for step in "${STEPS[@]}"; do
  echo "== $step"
  case "$step" in
    secrets) step_secrets ;;
    tracked) step_tracked ;;
    ci-logs) step_ci_logs ;;
    deps) step_deps ;;
    osv) step_osv ;;
    containers) step_containers ;;
    *) echo "unknown step: $step" >&2; false ;;
  esac
  code=$?
  if [ "$code" -eq 0 ]; then passed+=("$step"); else failed+=("$step($code)"); fi
done

echo "== summary"
echo "passed: ${passed[*]:-none}"
echo "failed: ${failed[*]:-none}"
[ ${#failed[@]} -eq 0 ]
