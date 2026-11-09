#!/usr/bin/env bash
set -euo pipefail
. "${CI_PROJECT_DIR:-.}/ci/lib/common.sh"
. "${CI_PROJECT_DIR:-.}/ci/lib/release-tag.sh"

require_env CI_JOB_TOKEN CI_PROJECT_ID CI_API_V4_URL CI_COMMIT_TAG
require_cmd npm node

bash "${CI_PROJECT_DIR:-.}/ci/check-tag-matches-version.sh"

dir="$(package_for_tag "${CI_COMMIT_TAG}")"
cd "${CI_PROJECT_DIR:-.}/${dir}"
[ -f dist/src/index.js ] || die "dist/ is missing: build:package must run first."

name="$(node -p "require('./package.json').name")"
version="$(node -p "require('./package.json').version")"
scope="${name%%/*}"
registry="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/npm/"

npmrc="$(mktemp)"
errors="$(mktemp)"
trap 'rm -f "${npmrc}" "${errors}"' EXIT
{
  printf '%s:registry=%s\n' "${scope}" "${registry}"
  printf '%s:_authToken=%s\n' "${registry#https:}" "${CI_JOB_TOKEN}"
} > "${npmrc}"

if [ "${dir}" = "packages/adapters" ]; then
  hooks="@stateforge-labs/harness-hooks"
  hooks_min="$(dependency_min_version . "${hooks}")"
  if seen_hooks="$(npm view "${hooks}@${hooks_min}" version --userconfig "${npmrc}" 2>"${errors}")" &&
    [ "${seen_hooks}" = "${hooks_min}" ]; then
    printf '%s@%s resolves in the GitLab registry\n' "${hooks}" "${hooks_min}"
  else
    die "${hooks}@${hooks_min} (the minimum of the dependency range) is not in the GitLab registry: publish harness-hooks first. $(cat "${errors}")"
  fi
fi

if seen="$(npm view "${name}@${version}" version --userconfig "${npmrc}" 2>"${errors}")"; then
  if [ "${seen}" = "${version}" ]; then
    printf '%s@%s is already in the GitLab registry: nothing to publish\n' "${name}" "${version}"
    exit 0
  fi
elif ! grep -q 'E404' "${errors}"; then
  die "could not ask the GitLab registry for ${name}@${version}: $(cat "${errors}")"
fi

npm pkg delete publishConfig.registry publishConfig.provenance
npm publish --ignore-scripts --userconfig "${npmrc}"
printf 'published %s@%s to %s\n' "${name}" "${version}" "${registry}"
