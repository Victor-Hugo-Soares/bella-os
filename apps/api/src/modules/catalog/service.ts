import { and, eq } from 'drizzle-orm';
import type { Db } from '@bella/db';
import { schema, withTenant } from '@bella/db';
import { newId } from '@bella/domain';
import type {
  CreateCategoryInput,
  CreateModifierGroupInput,
  CreateModifierInput,
  CreateProductInput,
  CreateStationInput,
  LinkProductModifierGroupInput,
  UpdateCategoryInput,
  UpdateModifierGroupInput,
  UpdateModifierInput,
  UpdateProductInput,
  UpdateStationInput,
} from '@bella/contracts';
import { AppError } from '../../lib/errors';

/**
 * Catálogo (M5, ACTIVE_PLAN.md). Todas as tabelas têm RLS igual a `roles`/`memberships`
 * (ADR-021) — sempre dentro de `withTenant()`, nunca o caso especial de `devices`
 * (ADR-025). "Excluir" é sempre soft-delete (`isActive=false`): nenhuma tabela de negócio
 * do projeto tem DELETE físico (mesmo padrão de `orders`/`payments` no domínio) — um
 * produto pode já estar referenciado por um pedido futuro.
 */

async function assertExists<T>(rows: T[], message: string): Promise<T> {
  const row = rows[0];
  if (!row) throw new AppError('NOT_FOUND', message);
  return row;
}

// --- Estações ---------------------------------------------------------------

export async function listStations(db: Db, tenantId: string, includeInactive = false) {
  return withTenant(db, tenantId, (tx) => {
    const query = tx.select().from(schema.stations);
    return includeInactive
      ? query.where(eq(schema.stations.tenantId, tenantId))
      : query.where(
          and(eq(schema.stations.tenantId, tenantId), eq(schema.stations.isActive, true)),
        );
  });
}

export async function createStation(db: Db, tenantId: string, input: CreateStationInput) {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .insert(schema.stations)
      .values({ id: newId(), tenantId, ...input })
      .returning(),
  );
  return row!;
}

export async function updateStation(
  db: Db,
  tenantId: string,
  stationId: string,
  input: UpdateStationInput,
) {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .update(schema.stations)
      .set(input)
      .where(and(eq(schema.stations.id, stationId), eq(schema.stations.tenantId, tenantId)))
      .returning(),
  );
  return assertExists(rows, 'Estação não encontrada.');
}

// --- Categorias ---------------------------------------------------------------

export async function listCategories(db: Db, tenantId: string, includeInactive = false) {
  return withTenant(db, tenantId, (tx) => {
    const query = tx.select().from(schema.categories);
    return includeInactive
      ? query.where(eq(schema.categories.tenantId, tenantId))
      : query.where(
          and(eq(schema.categories.tenantId, tenantId), eq(schema.categories.isActive, true)),
        );
  });
}

export async function createCategory(db: Db, tenantId: string, input: CreateCategoryInput) {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .insert(schema.categories)
      .values({ id: newId(), tenantId, ...input })
      .returning(),
  );
  return row!;
}

export async function updateCategory(
  db: Db,
  tenantId: string,
  categoryId: string,
  input: UpdateCategoryInput,
) {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .update(schema.categories)
      .set(input)
      .where(and(eq(schema.categories.id, categoryId), eq(schema.categories.tenantId, tenantId)))
      .returning(),
  );
  return assertExists(rows, 'Categoria não encontrada.');
}

// --- Produtos ---------------------------------------------------------------

export async function listProducts(db: Db, tenantId: string, includeInactive = false) {
  return withTenant(db, tenantId, (tx) => {
    const query = tx.select().from(schema.products);
    return includeInactive
      ? query.where(eq(schema.products.tenantId, tenantId))
      : query.where(
          and(eq(schema.products.tenantId, tenantId), eq(schema.products.isActive, true)),
        );
  });
}

async function assertCategoryAndStationBelongToTenant(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  tenantId: string,
  categoryId: string,
  stationId: string,
) {
  const [category] = await tx
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(and(eq(schema.categories.id, categoryId), eq(schema.categories.tenantId, tenantId)));
  if (!category) throw new AppError('VALIDATION_ERROR', 'categoryId não pertence a este tenant.');

  const [station] = await tx
    .select({ id: schema.stations.id })
    .from(schema.stations)
    .where(and(eq(schema.stations.id, stationId), eq(schema.stations.tenantId, tenantId)));
  if (!station) throw new AppError('VALIDATION_ERROR', 'stationId não pertence a este tenant.');
}

export async function createProduct(db: Db, tenantId: string, input: CreateProductInput) {
  return withTenant(db, tenantId, async (tx) => {
    await assertCategoryAndStationBelongToTenant(tx, tenantId, input.categoryId, input.stationId);
    const [row] = await tx
      .insert(schema.products)
      .values({ id: newId(), tenantId, ...input })
      .returning();
    return row!;
  });
}

export async function updateProduct(
  db: Db,
  tenantId: string,
  productId: string,
  input: UpdateProductInput,
) {
  return withTenant(db, tenantId, async (tx) => {
    if (input.categoryId || input.stationId) {
      const [current] = await tx
        .select({ categoryId: schema.products.categoryId, stationId: schema.products.stationId })
        .from(schema.products)
        .where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenantId)));
      if (!current) throw new AppError('NOT_FOUND', 'Produto não encontrado.');
      await assertCategoryAndStationBelongToTenant(
        tx,
        tenantId,
        input.categoryId ?? current.categoryId,
        input.stationId ?? current.stationId,
      );
    }
    const rows = await tx
      .update(schema.products)
      .set(input)
      .where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenantId)))
      .returning();
    return assertExists(rows, 'Produto não encontrado.');
  });
}

export async function setProductAvailability(
  db: Db,
  tenantId: string,
  productId: string,
  isAvailable: boolean,
) {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .update(schema.products)
      .set({ isAvailable })
      .where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenantId)))
      .returning(),
  );
  return assertExists(rows, 'Produto não encontrado.');
}

// --- Grupos de modificador e modificadores -----------------------------------

export async function listModifierGroups(db: Db, tenantId: string) {
  return withTenant(db, tenantId, (tx) =>
    tx.select().from(schema.modifierGroups).where(eq(schema.modifierGroups.tenantId, tenantId)),
  );
}

export async function createModifierGroup(
  db: Db,
  tenantId: string,
  input: CreateModifierGroupInput,
) {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .insert(schema.modifierGroups)
      .values({ id: newId(), tenantId, ...input })
      .returning(),
  );
  return row!;
}

export async function updateModifierGroup(
  db: Db,
  tenantId: string,
  groupId: string,
  input: UpdateModifierGroupInput,
) {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .update(schema.modifierGroups)
      .set(input)
      .where(
        and(eq(schema.modifierGroups.id, groupId), eq(schema.modifierGroups.tenantId, tenantId)),
      )
      .returning(),
  );
  return assertExists(rows, 'Grupo de modificador não encontrado.');
}

export async function listModifiers(db: Db, tenantId: string, groupId?: string) {
  return withTenant(db, tenantId, (tx) => {
    const query = tx.select().from(schema.modifiers);
    return groupId
      ? query.where(
          and(eq(schema.modifiers.tenantId, tenantId), eq(schema.modifiers.groupId, groupId)),
        )
      : query.where(eq(schema.modifiers.tenantId, tenantId));
  });
}

export async function createModifier(db: Db, tenantId: string, input: CreateModifierInput) {
  return withTenant(db, tenantId, async (tx) => {
    const [group] = await tx
      .select({ id: schema.modifierGroups.id })
      .from(schema.modifierGroups)
      .where(
        and(
          eq(schema.modifierGroups.id, input.groupId),
          eq(schema.modifierGroups.tenantId, tenantId),
        ),
      );
    if (!group) throw new AppError('VALIDATION_ERROR', 'groupId não pertence a este tenant.');
    const [row] = await tx
      .insert(schema.modifiers)
      .values({ id: newId(), tenantId, ...input })
      .returning();
    return row!;
  });
}

export async function updateModifier(
  db: Db,
  tenantId: string,
  modifierId: string,
  input: UpdateModifierInput,
) {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .update(schema.modifiers)
      .set(input)
      .where(and(eq(schema.modifiers.id, modifierId), eq(schema.modifiers.tenantId, tenantId)))
      .returning(),
  );
  return assertExists(rows, 'Modificador não encontrado.');
}

export async function linkProductModifierGroup(
  db: Db,
  tenantId: string,
  productId: string,
  input: LinkProductModifierGroupInput,
) {
  return withTenant(db, tenantId, async (tx) => {
    const [product] = await tx
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenantId)));
    if (!product) throw new AppError('NOT_FOUND', 'Produto não encontrado.');
    const [group] = await tx
      .select({ id: schema.modifierGroups.id })
      .from(schema.modifierGroups)
      .where(
        and(
          eq(schema.modifierGroups.id, input.groupId),
          eq(schema.modifierGroups.tenantId, tenantId),
        ),
      );
    if (!group) throw new AppError('VALIDATION_ERROR', 'groupId não pertence a este tenant.');

    const [row] = await tx
      .insert(schema.productModifierGroups)
      .values({
        id: newId(),
        tenantId,
        productId,
        groupId: input.groupId,
        sortOrder: input.sortOrder,
      })
      .returning();
    return row!;
  });
}

export async function unlinkProductModifierGroup(
  db: Db,
  tenantId: string,
  productId: string,
  groupId: string,
) {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .delete(schema.productModifierGroups)
      .where(
        and(
          eq(schema.productModifierGroups.tenantId, tenantId),
          eq(schema.productModifierGroups.productId, productId),
          eq(schema.productModifierGroups.groupId, groupId),
        ),
      )
      .returning({ id: schema.productModifierGroups.id }),
  );
  if (rows.length === 0) throw new AppError('NOT_FOUND', 'Vínculo não encontrado.');
}
