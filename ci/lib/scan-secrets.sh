#!/usr/bin/env bash
# ADR-097
set -euo pipefail
# shellcheck source=ci/lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

require_cmd gitleaks git

TARGET="${SECRETS_TARGET:-${CI_PROJECT_DIR:-$PWD}}"
git -C "$TARGET" rev-parse --git-dir >/dev/null 2>&1 ||
  die "'${TARGET}' no es un repositorio git: sin historia no hay nada que auditar."

args=(--no-banner --redact --exit-code 1)
[ -f "${TARGET}/.gitleaks.toml" ] && args+=(--config "${TARGET}/.gitleaks.toml")
if [ -f "${TARGET}/.gitleaks-baseline.json" ]; then
  args+=(--baseline-path "${TARGET}/.gitleaks-baseline.json")
  printf 'baseline: %s hallazgos ya conocidos quedan fuera del veredicto.\n' \
    "$(grep -c '"RuleID"' "${TARGET}/.gitleaks-baseline.json" || true)" >&2
fi

base="${CI_MERGE_REQUEST_DIFF_BASE_SHA:-}"
if [ -n "$base" ]; then
  git -C "$TARGET" cat-file -e "${base}^{commit}" 2>/dev/null ||
    die "el clon no trae ${base}, la base del merge request: con GIT_DEPTH corto este gate recorre una fracción de los commits y sale verde. Pon GIT_DEPTH: 0."
  range="${base}..HEAD"
else
  [ "$(git -C "$TARGET" rev-parse --is-shallow-repository)" = false ] ||
    die "clon superficial: este gate recorrería sólo los últimos commits y saldría verde. Pon GIT_DEPTH: 0."
  range=""
fi

if [ -n "$range" ]; then
  n=$(git -C "$TARGET" rev-list --count "$range")
  printf 'gitleaks: %s commits del rango %s.\n' "$n" "$range" >&2
  [ "$n" -gt 0 ] || { printf 'el rango no trae commits propios; nada que escanear.\n' >&2; exit 0; }
  exec gitleaks git "$TARGET" "${args[@]}" --log-opts="$range"
fi

n=$(git -C "$TARGET" rev-list --count HEAD)
printf 'gitleaks: %s commits, la historia entera de HEAD.\n' "$n" >&2
exec gitleaks git "$TARGET" "${args[@]}" --log-opts=HEAD
