import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '@bella/db';
import {
  createCategorySchema,
  createModifierGroupSchema,
  createModifierSchema,
  createProductSchema,
  createStationSchema,
  linkProductModifierGroupSchema,
  setProductAvailabilitySchema,
  updateCategorySchema,
  updateModifierGroupSchema,
  updateModifierSchema,
  updateProductSchema,
  updateStationSchema,
} from '@bella/contracts';
import { AppError } from '../../lib/errors';
import { resolveTenantBySlug } from '../../lib/tenant-slug';
import type { Auth } from '../identity/auth';
import { requirePermission } from '../identity/require-permission';
import * as catalog from './service';

export interface CatalogRoutesDeps {
  db: Db;
  auth: Auth;
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', result.error.issues.map((i) => i.message).join('; '));
  }
  return result.data;
}

const listQuerySchema = z.object({ includeInactive: z.coerce.boolean().default(false) });

/**
 * Catálogo (M5, ACTIVE_PLAN.md). Leitura e escrita exigem `catalog.manage` — não existe
 * cardápio público ainda (isso é M7, com rota `/public/*` própria e regra de
 * disponibilidade separada). Escopo do M5: `stations`/`categories`/`products` com CRUD
 * completo; `modifier_groups`/`modifiers`/vínculo com produto têm API pronta (sem UI
 * ainda, decisão registrada em ACTIVE_PLAN.md).
 */
export async function catalogRoutes(app: FastifyInstance, deps: CatalogRoutesDeps): Promise<void> {
  const { db, auth } = deps;
  const manage = { preHandler: requirePermission(db, auth, 'catalog.manage') };

  // Estações
  app.get('/v1/catalog/stations', manage, async (request) => {
    const query = parseOrThrow(listQuerySchema, request.query);
    const stations = await catalog.listStations(db, request.actor!.tenantId, query.includeInactive);
    return { stations };
  });
  app.post('/v1/catalog/stations', manage, async (request) => {
    const body = parseOrThrow(createStationSchema, request.body);
    const station = await catalog.createStation(db, request.actor!.tenantId, body);
    return { station };
  });
  app.patch<{ Params: { id: string } }>('/v1/catalog/stations/:id', manage, async (request) => {
    const body = parseOrThrow(updateStationSchema, request.body);
    const station = await catalog.updateStation(
      db,
      request.actor!.tenantId,
      request.params.id,
      body,
    );
    return { station };
  });

  // Categorias
  app.get('/v1/catalog/categories', manage, async (request) => {
    const query = parseOrThrow(listQuerySchema, request.query);
    const categories = await catalog.listCategories(
      db,
      request.actor!.tenantId,
      query.includeInactive,
    );
    return { categories };
  });
  app.post('/v1/catalog/categories', manage, async (request) => {
    const body = parseOrThrow(createCategorySchema, request.body);
    const category = await catalog.createCategory(db, request.actor!.tenantId, body);
    return { category };
  });
  app.patch<{ Params: { id: string } }>('/v1/catalog/categories/:id', manage, async (request) => {
    const body = parseOrThrow(updateCategorySchema, request.body);
    const category = await catalog.updateCategory(
      db,
      request.actor!.tenantId,
      request.params.id,
      body,
    );
    return { category };
  });

  // Produtos
  app.get('/v1/catalog/products', manage, async (request) => {
    const query = parseOrThrow(listQuerySchema, request.query);
    const products = await catalog.listProducts(db, request.actor!.tenantId, query.includeInactive);
    return { products };
  });
  app.post('/v1/catalog/products', manage, async (request) => {
    const body = parseOrThrow(createProductSchema, request.body);
    const product = await catalog.createProduct(db, request.actor!.tenantId, body);
    return { product };
  });
  app.patch<{ Params: { id: string } }>('/v1/catalog/products/:id', manage, async (request) => {
    const body = parseOrThrow(updateProductSchema, request.body);
    const product = await catalog.updateProduct(
      db,
      request.actor!.tenantId,
      request.params.id,
      body,
    );
    return { product };
  });
  app.patch<{ Params: { id: string } }>(
    '/v1/catalog/products/:id/availability',
    manage,
    async (request) => {
      const body = parseOrThrow(setProductAvailabilitySchema, request.body);
      const product = await catalog.setProductAvailability(
        db,
        request.actor!.tenantId,
        request.params.id,
        body.isAvailable,
      );
      return { product };
    },
  );

  // Grupos de modificador (API só — sem UI no M5)
  app.get('/v1/catalog/modifier-groups', manage, async (request) => {
    const groups = await catalog.listModifierGroups(db, request.actor!.tenantId);
    return { modifierGroups: groups };
  });
  app.post('/v1/catalog/modifier-groups', manage, async (request) => {
    const body = parseOrThrow(createModifierGroupSchema, request.body);
    const group = await catalog.createModifierGroup(db, request.actor!.tenantId, body);
    return { modifierGroup: group };
  });
  app.patch<{ Params: { id: string } }>(
    '/v1/catalog/modifier-groups/:id',
    manage,
    async (request) => {
      const body = parseOrThrow(updateModifierGroupSchema, request.body);
      const group = await catalog.updateModifierGroup(
        db,
        request.actor!.tenantId,
        request.params.id,
        body,
      );
      return { modifierGroup: group };
    },
  );

  // Modificadores
  const modifiersQuerySchema = z.object({ groupId: z.uuid().optional() });
  app.get('/v1/catalog/modifiers', manage, async (request) => {
    const query = parseOrThrow(modifiersQuerySchema, request.query);
    const modifiers = await catalog.listModifiers(db, request.actor!.tenantId, query.groupId);
    return { modifiers };
  });
  app.post('/v1/catalog/modifiers', manage, async (request) => {
    const body = parseOrThrow(createModifierSchema, request.body);
    const modifier = await catalog.createModifier(db, request.actor!.tenantId, body);
    return { modifier };
  });
  app.patch<{ Params: { id: string } }>('/v1/catalog/modifiers/:id', manage, async (request) => {
    const body = parseOrThrow(updateModifierSchema, request.body);
    const modifier = await catalog.updateModifier(
      db,
      request.actor!.tenantId,
      request.params.id,
      body,
    );
    return { modifier };
  });

  // Vínculo produto ↔ grupo de modificador
  app.post<{ Params: { id: string } }>(
    '/v1/catalog/products/:id/modifier-groups',
    manage,
    async (request) => {
      const body = parseOrThrow(linkProductModifierGroupSchema, request.body);
      const link = await catalog.linkProductModifierGroup(
        db,
        request.actor!.tenantId,
        request.params.id,
        body,
      );
      return { link };
    },
  );
  app.delete<{ Params: { id: string; groupId: string } }>(
    '/v1/catalog/products/:id/modifier-groups/:groupId',
    manage,
    async (request) => {
      await catalog.unlinkProductModifierGroup(
        db,
        request.actor!.tenantId,
        request.params.id,
        request.params.groupId,
      );
      return { unlinked: true };
    },
  );

  // Cardápio público (M7) — sem sessão de staff, só o que está ativo e disponível.
  app.get<{ Params: { tenantSlug: string } }>('/public/:tenantSlug/catalog', async (request) => {
    const tenantId = await resolveTenantBySlug(
      db,
      request.params.tenantSlug,
      'Restaurante não encontrado.',
    );
    return catalog.listPublicCatalog(db, tenantId);
  });
}
