#!/usr/bin/env bash
# ADR-093
set -euo pipefail
# shellcheck source=ci/lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

require_env KUBECONFORM_SCHEMA_DIR KUBECONFORM_TARGET
require_cmd kubeconform

[ -d "$KUBECONFORM_SCHEMA_DIR" ] ||
  die "sin esquemas en ${KUBECONFORM_SCHEMA_DIR}: kubeconform sin esquema local sale a internet o ignora el recurso."
[ -e "$KUBECONFORM_TARGET" ] || die "KUBECONFORM_TARGET '${KUBECONFORM_TARGET}' no existe."

exec kubeconform \
  -cache "${KUBECONFORM_CACHE_DIR:-/tmp/kubeconform-cache}" \
  -schema-location "file://${KUBECONFORM_SCHEMA_DIR}/{{.NormalizedKubernetesVersion}}-standalone{{.StrictSuffix}}/{{.ResourceKind}}{{.KindSuffix}}.json" \
  -schema-location "file://${KUBECONFORM_SCHEMA_DIR}/crds/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json" \
  -kubernetes-version "${KUBECONFORM_K8S_VERSION:-1.31.0}" \
  -strict \
  -summary \
  -n "${KUBECONFORM_PARALLEL:-8}" \
  "$KUBECONFORM_TARGET"
