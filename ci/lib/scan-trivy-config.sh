#!/usr/bin/env bash
# ADR-093
set -euo pipefail
# shellcheck source=ci/lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

require_env TRIVY_CONFIG_TARGET TRIVY_CACHE_DIR
require_cmd trivy

[ -d "$TRIVY_CACHE_DIR" ] ||
  die "TRIVY_CACHE_DIR '${TRIVY_CACHE_DIR}' no existe: la imagen compartida no trae el bundle horneado."
[ -e "$TRIVY_CONFIG_TARGET" ] || die "TRIVY_CONFIG_TARGET '${TRIVY_CONFIG_TARGET}' no existe."

[ -n "$(find "$TRIVY_CACHE_DIR" -type d -name 'polic*' -print -quit)" ] ||
  die "sin bundle de checks en ${TRIVY_CACHE_DIR}: con --skip-check-update esto no evaluaría NINGUNA política y saldría verde."

exec trivy config \
  --skip-check-update \
  --cache-dir "$TRIVY_CACHE_DIR" \
  --exit-code "${TRIVY_EXIT_CODE:-1}" \
  --severity "${TRIVY_SEVERITY:-HIGH,CRITICAL}" \
  --format "${TRIVY_FORMAT:-table}" \
  "$TRIVY_CONFIG_TARGET"
