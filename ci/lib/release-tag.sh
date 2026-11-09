#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

RELEASE_SEMVER='[0-9]+\.[0-9]+\.[0-9]+'

package_for_tag() {
  local tag="$1"
  if [[ "$tag" =~ ^(harness-hooks-)?v${RELEASE_SEMVER}$ ]]; then
    printf 'packages/hooks\n'
  elif [[ "$tag" =~ ^harness-adapters-v${RELEASE_SEMVER}$ ]]; then
    printf 'packages/adapters\n'
  else
    die "tag '${tag}' is not harness-hooks-vX.Y.Z, harness-adapters-vX.Y.Z or a legacy vX.Y.Z: nothing is published."
  fi
}

version_of_tag() {
  local tag="$1"
  package_for_tag "$tag" >/dev/null
  printf '%s\n' "${tag##*v}"
}

dependency_min_version() {
  local dir="$1" dep="$2" range min
  range="$(node -p "(require('./${dir}/package.json').dependencies || {})['${dep}'] || ''")"
  min="${range#^}"
  min="${min#~}"
  [[ "$min" =~ ^${RELEASE_SEMVER}$ ]] ||
    die "${dir} depends on ${dep} with range '${range}': cannot read a minimum version from it."
  printf '%s\n' "$min"
}
