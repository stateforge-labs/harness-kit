#!/usr/bin/env bash
set -euo pipefail
. "${CI_PROJECT_DIR:-.}/ci/lib/common.sh"

require_env CI_COMMIT_TAG
require_cmd node

version="$(node -p "require('./packages/hooks/package.json').version")"
[ "${CI_COMMIT_TAG}" = "v${version}" ] ||
  die "tag ${CI_COMMIT_TAG} does not match packages/hooks/package.json version ${version}: nothing is published."
printf 'tag %s matches packages/hooks/package.json %s\n' "${CI_COMMIT_TAG}" "${version}"
