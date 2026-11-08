#!/usr/bin/env bash
set -euo pipefail
. "${CI_PROJECT_DIR:-.}/ci/lib/common.sh"

require_env CI_JOB_TOKEN CI_SERVER_HOST
require_cmd git base64

auth="$(printf 'gitlab-ci-token:%s' "${CI_JOB_TOKEN}" | base64 | tr -d '\n')"
git config --global "http.https://${CI_SERVER_HOST}/.extraheader" "Authorization: Basic ${auth}"
unset auth

printf 'git: authenticated as the job token against %s\n' "${CI_SERVER_HOST}" >&2
