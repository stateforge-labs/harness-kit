#!/usr/bin/env bash
# ADR-093
set -euo pipefail
# shellcheck source=ci/lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

require_env OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY OSV_TARGET
require_cmd osv-scanner

[ -d "$OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY" ] ||
  die "sin base local en ${OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY}: --offline sin base no mira nada y sale 0."
[ -e "$OSV_TARGET" ] || die "OSV_TARGET '${OSV_TARGET}' no existe."

export OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY
exec osv-scanner scan source --offline --recursive "$OSV_TARGET"
