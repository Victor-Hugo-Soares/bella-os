#!/usr/bin/env bash
# Restaura um dump gerado por backup.sh (M18, ACTIVE_PLAN.md). --clean --if-exists:
# limpa objetos existentes antes de recriar (idempotente em cima de um banco já
# existente, mesmo padrão usado no teste de restore da CI). --no-owner --no-privileges:
# mesmo motivo do backup, nunca depender de dono/privilégio do banco de origem.
#
# Uso: DATABASE_URL=postgres://... ./restore.sh caminho-do-arquivo.dump
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL não definida." >&2
  exit 1
fi

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Uso: DATABASE_URL=... ./restore.sh caminho-do-arquivo.dump" >&2
  exit 1
fi

pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$FILE"
echo "Restauração concluída a partir de: $FILE"
