#!/usr/bin/env bash
# ADR-093
set -euo pipefail
# shellcheck source=ci/lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

require_env TRIVY_TARGET TRIVY_CACHE_DIR
require_cmd trivy python3

[ -d "$TRIVY_CACHE_DIR" ] ||
  die "TRIVY_CACHE_DIR '${TRIVY_CACHE_DIR}' no existe: la imagen compartida no trae la base horneada."

meta="${TRIVY_CACHE_DIR}/db/metadata.json"
[ -r "$meta" ] || die "sin ${meta}: no puedo saber la edad de la base, y suponerla fresca es lo que este check evita."

age=$(python3 -c 'import datetime,json,sys
with open(sys.argv[1]) as fh: m=json.load(fh)
s=m.get("UpdatedAt") or m.get("NextUpdate")
if not s: raise SystemExit("sin UpdatedAt ni NextUpdate")
w=datetime.datetime.fromisoformat(s.replace("Z","+00:00"))
print(int(abs((datetime.datetime.now(datetime.timezone.utc)-w).total_seconds())//3600))' "$meta")

warn_at="${TRIVY_WARN_DB_AGE_HOURS:-8}"
degrade_at="${TRIVY_DEGRADE_DB_AGE_HOURS:-${TRIVY_MAX_DB_AGE_HOURS:-24}}"
[ "$warn_at" -lt "$degrade_at" ] ||
  die "TRIVY_WARN_DB_AGE_HOURS (${warn_at}) debe ser menor que TRIVY_DEGRADE_DB_AGE_HOURS (${degrade_at})."

marker="${CI_SECURITY_DEGRADED_MARKER:-${CI_PROJECT_DIR:-.}/.ci-security-degraded}"
rm -f "$marker"

db_args=(--skip-db-update --skip-java-db-update)
unfixed_args=()
[ -z "${TRIVY_IGNORE_UNFIXED:-}" ] || unfixed_args=(--ignore-unfixed)

if [ "$age" -ge "$degrade_at" ]; then
  printf '================ ci-security: BASE VIEJA, DESCARGANDO ================\n' >&2
  printf 'La base horneada tiene %s h (umbral de degradación %s h).\n' "$age" "$degrade_at" >&2
  printf 'Este job NO se bloquea y NO escanea con un catálogo caducado: se baja una\n' >&2
  printf 'base fresca y escanea igual. Tarda más, y es correcto.\n' >&2
  printf 'Causa: el refresco de homelab/ci-templates no ha publicado a tiempo.\n' >&2
  printf '=====================================================================\n' >&2

  trivy image --download-db-only --cache-dir "$TRIVY_CACHE_DIR" ||
    die "la base horneada tiene ${age} h y tampoco pude descargar una fresca: sin catálogo utilizable no hay escaneo honesto que hacer."
  trivy image --download-java-db-only --cache-dir "$TRIVY_CACHE_DIR" ||
    die "no pude descargar la java-db y la horneada tiene ${age} h."

  printf 'ci-security: base descargada; el escaneo continúa con catálogo fresco.\n' >&2
  printf 'degraded: base horneada de %s h (umbral %s h); se descargó una fresca en el job.\n' \
    "$age" "$degrade_at" >"$marker"
elif [ "$age" -ge "$warn_at" ]; then
  printf 'AVISO: la base de trivy tiene %s h (aviso %s h, descarga %s h).\n' "$age" "$warn_at" "$degrade_at" >&2
  printf '  Se perdió al menos un ciclo de refresco. El escaneo sigue con la base horneada.\n' >&2
fi

exec trivy image \
  "${db_args[@]}" \
  ${unfixed_args[@]+"${unfixed_args[@]}"} \
  --cache-dir "$TRIVY_CACHE_DIR" \
  --exit-code "${TRIVY_EXIT_CODE:-1}" \
  --severity "${TRIVY_SEVERITY:-HIGH,CRITICAL}" \
  --format "${TRIVY_FORMAT:-table}" \
  "$TRIVY_TARGET"
