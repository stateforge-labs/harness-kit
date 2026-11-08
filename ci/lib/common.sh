#!/usr/bin/env bash
# ADR-093
set -euo pipefail

die() {
  printf 'FATAL: %s\n' "$*" >&2
  exit 1
}

die_undetermined() {
  printf 'NO PUEDO DETERMINARLO: %s\n' "$*" >&2
  exit 3
}

require_env() {
  local name missing=0
  for name in "$@"; do
    if [ -z "${!name:-}" ]; then
      printf 'FATAL: %s no está definida.\n' "$name" >&2
      missing=1
    fi
  done
  [ "$missing" -eq 0 ] || exit 1
}

require_cmd() {
  local name
  for name in "$@"; do
    command -v "$name" >/dev/null 2>&1 || die "este runner no tiene '$name' en PATH."
  done
}

json_engine() {
  if command -v python3 >/dev/null 2>&1; then
    printf 'python3'
  elif command -v jq >/dev/null 2>&1; then
    printf 'jq'
  else
    return 1
  fi
}

require_json_engine() {
  json_engine || die "ni python3 ni jq en este runner; un cuerpo JSON no se adivina con grep."
}

json_get() {
  local file="$1" key="$2" engine
  [ -r "$file" ] || die "json_get: no puedo leer '$file'."
  engine=$(require_json_engine) || exit 1
  case "$engine" in
    python3)
      python3 -c '
import json, sys
with open(sys.argv[1]) as fh:
    doc = json.load(fh)
print(doc.get(sys.argv[2], "") if isinstance(doc, dict) else "")
' "$file" "$key"
      ;;
    jq)
      jq -er --arg k "$key" '.[$k] // ""' <"$file"
      ;;
  esac
}

write_registry_auth() {
  local host="$1" user="$2" password="$3" dest="$4"
  local auth engine
  engine=$(require_json_engine) || exit 1
  auth=$(printf '%s:%s' "$user" "$password" | base64 | tr -d '\n')
  mkdir -p "$(dirname "$dest")"
  case "$engine" in
    python3)
      AUTH_HOST="$host" AUTH_VALUE="$auth" python3 -c '
import json, os, sys
doc = {"auths": {os.environ["AUTH_HOST"]: {"auth": os.environ["AUTH_VALUE"]}}}
with open(sys.argv[1], "w") as fh:
    json.dump(doc, fh)
' "$dest"
      ;;
    jq)
      # Por el entorno, como en la rama python3: `--arg auth` dejaría el base64 de usuario y
      # contraseña en el argv de jq, que cualquiera lee en /proc/<pid>/cmdline.
      AUTH_VALUE="$auth" jq -n --arg host "$host" \
        '{auths: {($host): {auth: env.AUTH_VALUE}}}' >"$dest"
      ;;
  esac
  chmod 600 "$dest"
}

# --- Registro (Harbor): lo comparten registry-add-tag, registry-verify-tag y registry-tag-age.

# is_sha256_digest <valor>: entero, `sha256:` y 64 hex en minúscula. Un digest va a una URL y
# se compara con un hash: ni `sha256:../x` ni un prefijo.
is_sha256_digest() {
  [[ "$1" =~ ^sha256:[0-9a-f]{64}$ ]]
}

# curl_config <opción> <valor>: una línea de config de curl para `-K -`, con el valor entre
# comillas y escapado. Usuario, contraseña y token viajan así por stdin: en argv los leería
# cualquiera que mire /proc/<pid>/cmdline.
curl_config() {
  local value=${2//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  printf '%s = "%s"\n' "$1" "$value"
}

# transport_ok <rc> <http_code> <qué intentaba>: un curl que salió con error (red, TLS, la
# propia config `-K -`, una transferencia cortada) no es "Harbor respondió X": lo dice con su
# número. Quien llama guarda el rc con `|| rc=$?` en vez de dejar que set -e corte en silencio.
transport_ok() {
  [ "$1" -eq 0 ] ||
    die "sin respuesta válida de ${HARBOR_HOST} al $3: curl salió con $1 (HTTP ${2:-000}); su error está justo encima."
}

# El realm lo dicta la respuesta de /v2/, no este repo: antes de mandarle usuario y
# contraseña tiene que ser https y su host el propio HARBOR_HOST o uno que el
# consumidor liste en HARBOR_TOKEN_HOSTS. curl va sin -L, así que tampoco hay
# redirección que se las lleve a otro sitio; y con -q como PRIMER argumento, que es lo único que
# le impide leer el ~/.curlrc del runner, donde un `location-trusted` las seguiría con las
# credenciales puestas. Todo curl de ci/ empieza así (ci/check-curl-q.sh lo exige).
realm_host_allowed() {
  local realm="$1" authority host allowed
  case "$realm" in
    https://*) ;;
    *) die "el realm '${realm}' no es https: no le mando las credenciales de Harbor." ;;
  esac
  authority=${realm#https://}
  authority=${authority%%[/?#]*}
  host=$(printf '%s' "${authority##*@}" | tr '[:upper:]' '[:lower:]')
  for allowed in "$HARBOR_HOST" ${HARBOR_TOKEN_HOSTS:-}; do
    [ "$host" = "$(printf '%s' "$allowed" | tr '[:upper:]' '[:lower:]')" ] && return 0
  done
  die "el realm de ${HARBOR_HOST}/v2/ apunta a '${host}', que no es ${HARBOR_HOST} ni está en HARBOR_TOKEN_HOSTS: no le mando las credenciales."
}

# registry_token <acciones> <fichero>: token Bearer de Harbor para IMAGE_REPO con esas acciones
# (`pull`, `pull,push`). El fichero de la respuesta lo crea y lo limpia quien llama, en el
# proceso principal: esto corre en un `$(…)`, y si cancelan el job aquí dentro solo la trampa
# de fuera lo borra.
registry_token() {
  local actions="$1" body="$2" probe challenge realm service token
  probe=$(curl -q -sS -o /dev/null -D - "https://${HARBOR_HOST}/v2/") ||
    die "sin respuesta de ${HARBOR_HOST}/v2/ al pedir el challenge: curl salió con $?."
  challenge=$(printf '%s' "$probe" | tr -d '\r' | grep -i '^www-authenticate:' || true)
  realm=$(printf '%s' "$challenge" | sed -n 's/.*[Rr][Ee][Aa][Ll][Mm]="\([^"]*\)".*/\1/p')
  service=$(printf '%s' "$challenge" | sed -n 's/.*[Ss][Ee][Rr][Vv][Ii][Cc][Ee]="\([^"]*\)".*/\1/p')
  [ -n "$realm" ] || die "${HARBOR_HOST}/v2/ no emitió challenge Bearer: ${challenge:-<sin cabecera www-authenticate>}"
  realm_host_allowed "$realm"
  curl_config user "${HARBOR_USERNAME}:${HARBOR_PASSWORD}" |
    curl -q -sS -K - --get --data-urlencode "service=${service}" \
      --data-urlencode "scope=repository:${IMAGE_REPO}:${actions}" \
      -o "$body" "$realm" ||
    die "no pude pedir el token (${actions}) a ${realm}: curl salió con $?."
  token=$(json_get "$body" token) || die "el endpoint de token no respondió JSON."
  [ -n "$token" ] || die "${realm} no devolvió token (${actions}) para ${IMAGE_REPO}."
  # Va a una cabecera: un CR o LF la partiría en dos. Un token Bearer (RFC 6750) no los necesita.
  case "$token" in
    *[![:alnum:]._~+/=_-]*)
      die "${realm} devolvió un token con caracteres fuera de [A-Za-z0-9._~+/=_-]: no lo meto en una cabecera." ;;
  esac
  printf '%s' "$token"
}
