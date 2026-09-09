import { uuidv7 } from 'uuidv7';

/**
 * IDs do Bella OS são UUID v7 (ordenáveis por tempo — bons para índices e para depuração,
 * já que o prefixo mostra quando o registro nasceu). Ver DECISIONS.md ADR-019.
 * Wrapper único para não espalhar a biblioteca escolhida pelo código do projeto.
 */
export function newId(): string {
  return uuidv7();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
