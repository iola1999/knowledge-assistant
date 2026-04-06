#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=${ANCHORDESK_REPO_ROOT:-$(cd -- "${SCRIPT_DIR}/.." && pwd)}

ENV_FILE=${ANCHORDESK_ENV_FILE:-"${REPO_ROOT}/.env.production"}
ENV_EXAMPLE_FILE=${ANCHORDESK_ENV_EXAMPLE_FILE:-"${REPO_ROOT}/.env.production.example"}
COMPOSE_FILE=${ANCHORDESK_COMPOSE_FILE:-"${REPO_ROOT}/docker-compose.prod.yml"}

log() {
  printf '[deploy] %s\n' "$*"
}

require_file() {
  local target_path=$1
  local label=$2

  if [[ ! -f "${target_path}" ]]; then
    printf '[deploy] missing %s: %s\n' "${label}" "${target_path}" >&2
    exit 1
  fi
}

docker_compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

if ! command -v git >/dev/null 2>&1; then
  printf '[deploy] git is not installed or not in PATH\n' >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  printf '[deploy] docker is not installed or not in PATH\n' >&2
  exit 1
fi

if ! git -C "${REPO_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf '[deploy] not a git repository: %s\n' "${REPO_ROOT}" >&2
  exit 1
fi

require_file "${ENV_EXAMPLE_FILE}" ".env.production.example"
require_file "${COMPOSE_FILE}" "docker-compose.prod.yml"

log "pulling latest code from git"
git -C "${REPO_ROOT}" pull --ff-only

if [[ ! -f "${ENV_FILE}" ]]; then
  log "creating ${ENV_FILE} from ${ENV_EXAMPLE_FILE}"
  cp "${ENV_EXAMPLE_FILE}" "${ENV_FILE}"
else
  log "keeping existing ${ENV_FILE}"
fi

log "building production images"
docker_compose build

log "starting infrastructure containers"
docker_compose up -d postgres redis qdrant minio

log "running upgrade job"
docker_compose run --rm upgrade

log "starting runtime services"
docker_compose up -d web worker agent-runtime parser

log "current service status"
docker_compose ps
