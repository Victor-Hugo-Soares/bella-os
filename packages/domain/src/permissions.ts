/**
 * Chaves de permissão do Bella OS. Fonte única: seed do banco (papéis padrão) e
 * `requirePermission()` na API leem daqui. Adicionar uma permissão nova é sempre
 * adicionar uma chave aqui primeiro — nunca checar uma string solta em um handler.
 *
 * Nomeadas `<área>.<ação>`; variantes mais específicas usam um terceiro segmento
 * (ex.: `orders.cancel.after_production` é mais sensível que `orders.cancel.before_production`).
 */
export const PERMISSION_KEYS = [
  // catálogo
  'catalog.manage',
  // mesas e sessões
  'tables.manage',
  'table_sessions.transfer',
  // pedidos
  'orders.create',
  'orders.create.on_behalf_of_table',
  'orders.cancel.before_production',
  'orders.cancel.after_production',
  // cozinha / produção
  'kitchen.operate',
  // financeiro
  'discounts.apply',
  'payments.record',
  'payments.void',
  'tabs.close',
  'cash.open',
  'cash.close',
  'cash.movement',
  // estoque (Fase E; chave reservada desde já para não migrar papéis duas vezes)
  'inventory.manage',
  // administração
  'users.manage',
  'roles.manage',
  'devices.manage',
  'settings.manage',
  'reports.view',
  'audit.view',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}

/** Papéis de sistema semeados em todo tenant novo (DOMAIN_MODEL.md §1.2). */
export const SYSTEM_ROLES = ['owner', 'manager', 'cashier', 'waiter', 'kitchen'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

/**
 * Permissões padrão por papel de sistema. `owner` tem todas (dono do restaurante).
 * `manager` tem tudo exceto gestão de usuários/papéis (fica com o owner por padrão,
 * mas o dono pode conceder via `roles.manage` depois — não é regra imutável).
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<SystemRole, readonly PermissionKey[]> = {
  owner: PERMISSION_KEYS,
  manager: PERMISSION_KEYS.filter((k) => k !== 'users.manage' && k !== 'roles.manage'),
  cashier: [
    'orders.create',
    'orders.create.on_behalf_of_table',
    'orders.cancel.before_production',
    'discounts.apply',
    'payments.record',
    'payments.void',
    'tabs.close',
    'cash.open',
    'cash.close',
    'cash.movement',
    'table_sessions.transfer',
    'reports.view',
  ],
  waiter: [
    'orders.create',
    'orders.create.on_behalf_of_table',
    'orders.cancel.before_production',
    'table_sessions.transfer',
    'tables.manage',
  ],
  kitchen: ['kitchen.operate'],
};
