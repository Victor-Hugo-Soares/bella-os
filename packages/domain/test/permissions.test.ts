import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_KEYS,
  SYSTEM_ROLES,
  isPermissionKey,
} from '../src/permissions';

describe('permissions', () => {
  it('não tem chaves duplicadas', () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
  });

  it('isPermissionKey reconhece chaves válidas e rejeita lixo', () => {
    expect(isPermissionKey('orders.create')).toBe(true);
    expect(isPermissionKey('orders.voar')).toBe(false);
    expect(isPermissionKey('')).toBe(false);
  });

  it('todo papel de sistema tem uma entrada em DEFAULT_ROLE_PERMISSIONS', () => {
    for (const role of SYSTEM_ROLES) {
      expect(DEFAULT_ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it('toda permissão default é uma chave válida (nenhum papel referencia string solta)', () => {
    for (const role of SYSTEM_ROLES) {
      for (const key of DEFAULT_ROLE_PERMISSIONS[role]) {
        expect(isPermissionKey(key)).toBe(true);
      }
    }
  });

  it('owner tem todas as permissões existentes', () => {
    expect(new Set(DEFAULT_ROLE_PERMISSIONS.owner)).toEqual(new Set(PERMISSION_KEYS));
  });

  it('manager tem tudo exceto gestão de usuários e papéis', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.manager).not.toContain('users.manage');
    expect(DEFAULT_ROLE_PERMISSIONS.manager).not.toContain('roles.manage');
    expect(DEFAULT_ROLE_PERMISSIONS.manager.length).toBe(PERMISSION_KEYS.length - 2);
  });

  it('kitchen só opera a cozinha (papel de dispositivo, superfície mínima)', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.kitchen).toEqual(['kitchen.operate']);
  });

  it('cashier não tem cancelamento após início de produção (decisão mais sensível)', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.cashier).not.toContain('orders.cancel.after_production');
  });
});
