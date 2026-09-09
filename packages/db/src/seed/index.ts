import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ROLE_PERMISSIONS, SYSTEM_ROLES, newId } from '@bella/domain';
import { eq } from 'drizzle-orm';
import { createDb, type DbHandle } from '../client';
import { memberships, roles, rolePermissions, tenantSettings, tenants, users } from '../schema';
import { withTenant, withoutTenant } from '../tenant-context';

export interface SeedTenantSpec {
  slug: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
}

/**
 * Dois tenants fictícios para desenvolvimento, testes de integração e para provar
 * isolamento entre restaurantes (DOMAIN_MODEL.md, ACTIVE_PLAN.md M1). Nenhum dado real.
 * Idempotente: pode rodar várias vezes sem duplicar (upsert por slug/email/nome único).
 */
export const SEED_TENANTS: SeedTenantSpec[] = [
  {
    slug: 'bella',
    name: 'Bella III',
    ownerEmail: 'dono@bella.example.com',
    ownerName: 'Dono do Bella (seed)',
  },
  {
    slug: 'demo',
    name: 'Restaurante Demo',
    ownerEmail: 'dono@demo.example.com',
    ownerName: 'Dono do Demo (seed)',
  },
];

async function upsertTenant(db: DbHandle['db'], spec: SeedTenantSpec): Promise<string> {
  return withoutTenant(db, async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ id: newId(), slug: spec.slug, name: spec.name })
      .onConflictDoUpdate({ target: tenants.slug, set: { name: spec.name } })
      .returning({ id: tenants.id });
    if (!tenant) throw new Error(`falha ao upsertar tenant ${spec.slug}`);

    await tx
      .insert(tenantSettings)
      .values({ tenantId: tenant.id })
      .onConflictDoNothing({ target: tenantSettings.tenantId });

    return tenant.id;
  });
}

async function upsertUser(db: DbHandle['db'], email: string, name: string): Promise<string> {
  return withoutTenant(db, async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ id: newId(), email, name })
      .onConflictDoUpdate({ target: users.email, set: { name } })
      .returning({ id: users.id });
    if (!user) throw new Error(`falha ao upsertar usuário ${email}`);
    return user.id;
  });
}

async function seedRolesAndPermissions(
  db: DbHandle['db'],
  tenantId: string,
): Promise<Record<(typeof SYSTEM_ROLES)[number], string>> {
  return withTenant(db, tenantId, async (tx) => {
    const roleIds = {} as Record<(typeof SYSTEM_ROLES)[number], string>;
    for (const roleName of SYSTEM_ROLES) {
      const [role] = await tx
        .insert(roles)
        .values({ id: newId(), tenantId, name: roleName, isSystem: true })
        .onConflictDoUpdate({
          target: [roles.tenantId, roles.name],
          set: { isSystem: true },
        })
        .returning({ id: roles.id });
      if (!role) throw new Error(`falha ao upsertar papel ${roleName} do tenant ${tenantId}`);
      roleIds[roleName] = role.id;

      // Substitui o conjunto de permissões do papel pelo default atual (fonte única:
      // @bella/domain permissions.ts). Reseed é a forma de "migrar" permissões de papel.
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
      const keys = DEFAULT_ROLE_PERMISSIONS[roleName];
      if (keys.length > 0) {
        await tx
          .insert(rolePermissions)
          .values(keys.map((permissionKey) => ({ roleId: role.id, tenantId, permissionKey })));
      }
    }
    return roleIds;
  });
}

async function seedOwnerMembership(
  db: DbHandle['db'],
  tenantId: string,
  userId: string,
  ownerRoleId: string,
): Promise<void> {
  await withTenant(db, tenantId, async (tx) => {
    await tx
      .insert(memberships)
      .values({ id: newId(), userId, tenantId, roleId: ownerRoleId })
      .onConflictDoUpdate({
        target: [memberships.userId, memberships.tenantId],
        set: { roleId: ownerRoleId },
      });
  });
}

export async function seed(db: DbHandle['db']): Promise<void> {
  for (const spec of SEED_TENANTS) {
    const tenantId = await upsertTenant(db, spec);
    const ownerId = await upsertUser(db, spec.ownerEmail, spec.ownerName);
    const roleIds = await seedRolesAndPermissions(db, tenantId);
    await seedOwnerMembership(db, tenantId, ownerId, roleIds.owner);
  }
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isDirectRun = entry !== '' && entry === fileURLToPath(import.meta.url);

if (isDirectRun) {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
    console.error(
      'Recusando rodar o seed com NODE_ENV=production sem SEED_ALLOW_PRODUCTION=true. ' +
        'O seed cria tenants/usuários fictícios — nunca use em produção sem ter certeza.',
    );
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não definida (ver .env.example).');
    process.exit(1);
  }
  const handle = createDb(url, { max: 1 });
  seed(handle.db)
    .then(async () => {
      console.warn(`seed aplicado: ${SEED_TENANTS.map((t) => t.slug).join(', ')}`);
      await handle.close();
    })
    .catch(async (err: unknown) => {
      console.error('falha ao semear:', err);
      await handle.close();
      process.exit(1);
    });
}
