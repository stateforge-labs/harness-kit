#!/usr/bin/env bash
set -euo pipefail
. "${CI_PROJECT_DIR:-.}/ci/lib/common.sh"
. "${CI_PROJECT_DIR:-.}/ci/lib/release-tag.sh"

require_env CI_COMMIT_TAG
require_cmd node

dir="$(package_for_tag "${CI_COMMIT_TAG}")"
tag_version="$(version_of_tag "${CI_COMMIT_TAG}")"
version="$(node -p "require('./${dir}/package.json').version")"
[ "${tag_version}" = "${version}" ] ||
  die "tag ${CI_COMMIT_TAG} does not match ${dir}/package.json version ${version}: nothing is published."
printf 'tag %s matches %s/package.json %s\n' "${CI_COMMIT_TAG}" "${dir}" "${version}"
