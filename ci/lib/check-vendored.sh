#!/usr/bin/env bash
# ADR-093
set -euo pipefail
# shellcheck source=ci/lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

require_env CI_TEMPLATES_REF CI_TEMPLATES_URL
require_cmd git diff

: "${VENDORED_ROOT:=${CI_PROJECT_DIR:-$PWD}}"
: "${VENDORED_PATHS:=ci/lib tests/test_ci_pipeline_shape.py}"

case "$CI_TEMPLATES_REF" in
  v[0-9]*.[0-9]*.[0-9]*) ;;
  *) die "CI_TEMPLATES_REF='${CI_TEMPLATES_REF}' no es un tag vX.Y.Z: 'main' se mueve bajo los pies del consumidor." ;;
esac

reference=$(mktemp -d)
# TERM e INT salen, y con eso pasan por EXIT: una trampa que solo borrara dejaría
# seguir al script sin sus ficheros temporales.
trap 'rm -rf "$reference"' EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

git clone --quiet --depth 1 --branch "$CI_TEMPLATES_REF" "$CI_TEMPLATES_URL" "$reference" ||
  die_undetermined "no pude clonar ${CI_TEMPLATES_URL} en ${CI_TEMPLATES_REF}; sin referencia no juzgo nada."

compared=0
diverged=0

for path in $VENDORED_PATHS; do
  remote="${reference}/${path}"
  mine="${VENDORED_ROOT}/${path}"

  [ -e "$remote" ] ||
    die_undetermined "el tag ${CI_TEMPLATES_REF} no trae '${path}': la referencia no es la que se cree."

  if [ ! -e "$mine" ]; then
    printf '  · %s no está vendorizado aquí — nada que comparar\n' "$path"
    continue
  fi

  compared=$(( compared + 1 ))
  if diff -ru "$remote" "$mine"; then
    printf '  ✓ %s coincide con %s\n' "$path" "$CI_TEMPLATES_REF"
  else
    diverged=$(( diverged + 1 ))
  fi
done

[ "$compared" -gt 0 ] ||
  die_undetermined "ninguna ruta de VENDORED_PATHS existe en este repo: el check no comparó nada, y eso no es 'todo bien'."

if [ "$diverged" -gt 0 ]; then
  printf 'FATAL: %d ruta(s) divergen de %s. Re-vendoriza desde el tag o sube el tag; una copia editada a mano es como empezó el 401 de ci-security.\n' \
    "$diverged" "$CI_TEMPLATES_REF" >&2
  exit 1
fi

printf 'vendorizado OK: %d ruta(s) coinciden con %s@%s\n' "$compared" "$CI_TEMPLATES_URL" "$CI_TEMPLATES_REF"
