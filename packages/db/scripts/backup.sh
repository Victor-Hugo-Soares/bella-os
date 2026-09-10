#!/usr/bin/env bash
# Backup do banco (M18, ACTIVE_PLAN.md). Formato custom (-Fc): compacto e permite
# restauração seletiva/limpa com pg_restore --clean --if-exists (ADR de ROADMAP.md M18).
# --no-owner --no-privileges: a app roda como bella_app, não como dono das tabelas
# (ADR-020) -- o dump não deve depender de quem é dono no banco de origem.
#
# Uso: DATABASE_URL=postgres://... ./backup.sh [caminho-de-saida.dump]
# Sem argumento, grava em packages/db/backups/bella-<timestamp>.dump (nunca commitado).
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL não definida." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_DIR="$SCRIPT_DIR/../backups"
OUT="${1:-$DEFAULT_DIR/bella-$(date -u +%Y%m%dT%H%M%SZ).dump}"

mkdir -p "$(dirname "$OUT")"
pg_dump --format=custom --no-owner --no-privileges --file="$OUT" "$DATABASE_URL"
echo "Backup gravado em: $OUT"
