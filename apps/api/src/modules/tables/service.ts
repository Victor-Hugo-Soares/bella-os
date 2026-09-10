import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@bella/db';
import { schema, withoutTenant, withTenant } from '@bella/db';
import { generateDeviceToken, generateTableCode, hashDeviceToken, newId } from '@bella/domain';
import type {
  CreateAreaInput,
  CreateTableInput,
  UpdateAreaInput,
  UpdateTableInput,
} from '@bella/contracts';
import { AppError } from '../../lib/errors';
import { resolveTenantBySlug } from '../../lib/tenant-slug';

const QR_CODE_MAX_ATTEMPTS = 5;

async function assertExists<T>(rows: T[], message: string): Promise<T> {
  const row = rows[0];
  if (!row) throw new AppError('NOT_FOUND', message);
  return row;
}

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? String(err.cause ?? err.message) : String(err);
  return /duplicate key|unique/i.test(message);
}

// --- Áreas --------------------------------------------------------------

export async function listAreas(db: Db, tenantId: string, includeInactive = false) {
  return withTenant(db, tenantId, (tx) => {
    const query = tx.select().from(schema.areas);
    return includeInactive
      ? query.where(eq(schema.areas.tenantId, tenantId))
      : query.where(and(eq(schema.areas.tenantId, tenantId), eq(schema.areas.isActive, true)));
  });
}

export async function createArea(db: Db, tenantId: string, input: CreateAreaInput) {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .insert(schema.areas)
      .values({ id: newId(), tenantId, ...input })
      .returning(),
  );
  return row!;
}

export async function updateArea(db: Db, tenantId: string, areaId: string, input: UpdateAreaInput) {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .update(schema.areas)
      .set(input)
      .where(and(eq(schema.areas.id, areaId), eq(schema.areas.tenantId, tenantId)))
      .returning(),
  );
  return assertExists(rows, 'Área não encontrada.');
}

// --- Mesas ----------------------------------------------------------------

export async function listTables(db: Db, tenantId: string, includeInactive = false) {
  return withTenant(db, tenantId, (tx) => {
    const query = tx.select().from(schema.tables);
    return includeInactive
      ? query.where(eq(schema.tables.tenantId, tenantId))
      : query.where(and(eq(schema.tables.tenantId, tenantId), eq(schema.tables.isActive, true)));
  });
}

export async function createTable(db: Db, tenantId: string, input: CreateTableInput) {
  if (input.areaId) {
    await withTenant(db, tenantId, async (tx) => {
      const [area] = await tx
        .select({ id: schema.areas.id })
        .from(schema.areas)
        .where(and(eq(schema.areas.id, input.areaId!), eq(schema.areas.tenantId, tenantId)));
      if (!area) throw new AppError('VALIDATION_ERROR', 'areaId não pertence a este tenant.');
    });
  }
  for (let attempt = 0; attempt < QR_CODE_MAX_ATTEMPTS; attempt++) {
    const qrCode = generateTableCode();
    try {
      const [row] = await withTenant(db, tenantId, (tx) =>
        tx
          .insert(schema.tables)
          .values({ id: newId(), tenantId, qrCode, ...input })
          .returning(),
      );
      return row!;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new AppError('INTERNAL_ERROR', 'Não foi possível gerar um código de mesa único.');
}

export async function updateTable(
  db: Db,
  tenantId: string,
  tableId: string,
  input: UpdateTableInput,
) {
  return withTenant(db, tenantId, async (tx) => {
    if (input.areaId) {
      const [area] = await tx
        .select({ id: schema.areas.id })
        .from(schema.areas)
        .where(and(eq(schema.areas.id, input.areaId!), eq(schema.areas.tenantId, tenantId)));
      if (!area) throw new AppError('VALIDATION_ERROR', 'areaId não pertence a este tenant.');
    }
    const rows = await tx
      .update(schema.tables)
      .set(input)
      .where(and(eq(schema.tables.id, tableId), eq(schema.tables.tenantId, tenantId)))
      .returning();
    return assertExists(rows, 'Mesa não encontrada.');
  });
}

// --- Sessão de mesa (rota pública) -----------------------------------------

export interface OpenSessionResult {
  tableSessionId: string;
  tabId: string;
  tableLabel: string;
  guestToken: string;
}

interface TableRow {
  id: string;
  label: string;
}

async function findActiveTableByCode(db: Db, tenantId: string, qrCode: string): Promise<TableRow> {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ id: schema.tables.id, label: schema.tables.label })
      .from(schema.tables)
      .where(
        and(
          eq(schema.tables.qrCode, qrCode),
          eq(schema.tables.tenantId, tenantId),
          eq(schema.tables.isActive, true),
        ),
      ),
  );
  const table = rows[0];
  if (!table) throw new AppError('NOT_FOUND', 'Mesa não encontrada.');
  return table;
}

/**
 * Tenta criar uma sessão NOVA (+ comanda + convidado) numa transação própria. Se colidir
 * com o índice único parcial (já existe sessão aberta para a mesa — concorrência real
 * ou reload), a transação inteira é desfeita pelo Postgres e o erro sobe limpo para o
 * chamador decidir o que fazer — nunca tentamos "continuar" a mesma transação depois de
 * uma violação de constraint (o Postgres aborta o restante dela até o rollback).
 */
async function tryCreateSession(
  db: Db,
  tenantId: string,
  table: TableRow,
): Promise<OpenSessionResult> {
  return withTenant(db, tenantId, async (tx) => {
    const [session] = await tx
      .insert(schema.tableSessions)
      .values({ id: newId(), tenantId, tableId: table.id, status: 'open', openedBy: 'customer' })
      .returning({ id: schema.tableSessions.id });
    const [tab] = await tx
      .insert(schema.tabs)
      .values({ id: newId(), tenantId, tableSessionId: session!.id, label: table.label })
      .returning({ id: schema.tabs.id });
    return createGuestForSession(tx, tenantId, session!.id, tab!.id, table.label);
  });
}

/** Entra (como novo `guest`) numa sessão que já está aberta para a mesa. */
async function joinExistingSession(
  db: Db,
  tenantId: string,
  table: TableRow,
): Promise<OpenSessionResult> {
  return withTenant(db, tenantId, async (tx) => {
    const [session] = await tx
      .select({ id: schema.tableSessions.id })
      .from(schema.tableSessions)
      .where(
        and(eq(schema.tableSessions.tableId, table.id), eq(schema.tableSessions.status, 'open')),
      );
    if (!session) {
      throw new AppError('CONFLICT', 'Sessão de mesa em disputa; tente novamente.');
    }
    let [tab] = await tx
      .select({ id: schema.tabs.id })
      .from(schema.tabs)
      .where(and(eq(schema.tabs.tableSessionId, session.id), eq(schema.tabs.status, 'open')));
    if (!tab) {
      [tab] = await tx
        .insert(schema.tabs)
        .values({ id: newId(), tenantId, tableSessionId: session.id, label: table.label })
        .returning({ id: schema.tabs.id });
    }
    return createGuestForSession(tx, tenantId, session.id, tab!.id, table.label);
  });
}

async function createGuestForSession(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  tenantId: string,
  tableSessionId: string,
  tabId: string,
  tableLabel: string,
): Promise<OpenSessionResult> {
  const guestToken = generateDeviceToken();
  await tx.insert(schema.guests).values({
    id: newId(),
    tenantId,
    tableSessionId,
    tabId,
    tokenHash: hashDeviceToken(guestToken),
  });
  return { tableSessionId, tabId, tableLabel, guestToken };
}

/**
 * Abre (ou entra n)uma sessão de mesa a partir do QR Code físico. Se já existir uma
 * sessão aberta para a mesa (outro celular escaneou primeiro, ou o mesmo celular
 * escaneou de novo), este cliente entra como um novo `guest` NA MESMA sessão — nunca
 * cria uma segunda sessão (o índice único parcial de `table_sessions` garante isso sob
 * concorrência real; a colisão vira "achar a sessão existente e entrar nela", não erro).
 * Sempre devolve um token de convidado NOVO (um por celular/aba, DOMAIN_MODEL.md §1.4).
 */
export async function openTableSession(
  db: Db,
  tenantSlug: string,
  qrCode: string,
): Promise<OpenSessionResult> {
  const tenantId = await resolveTenantBySlug(db, tenantSlug, 'Mesa não encontrada.');
  const table = await findActiveTableByCode(db, tenantId, qrCode);
  try {
    return await tryCreateSession(db, tenantId, table);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return await joinExistingSession(db, tenantId, table);
  }
}

export interface GuestActor {
  type: 'guest';
  guestId: string;
  tenantId: string;
  tableSessionId: string;
  tabId: string | null;
}

/**
 * Resolve o cliente pelo token bruto do cookie. Busca sem contexto de tenant de
 * propósito — `guests` não tem RLS (ver comentário no schema), mesmo motivo de
 * `resolveDeviceActor`: ainda não sabemos o tenant até achar o guest pelo hash do token.
 */
export async function resolveGuestActor(db: Db, rawToken: string | undefined): Promise<GuestActor> {
  if (!rawToken) throw new AppError('UNAUTHENTICATED', 'Sessão de mesa ausente.');
  const tokenHash = hashDeviceToken(rawToken);
  const rows = await withoutTenant(db, (tx) =>
    tx.select().from(schema.guests).where(eq(schema.guests.tokenHash, tokenHash)),
  );
  const guest = rows[0];
  if (!guest) throw new AppError('UNAUTHENTICATED', 'Sessão de mesa inválida.');
  return {
    type: 'guest',
    guestId: guest.id,
    tenantId: guest.tenantId,
    tableSessionId: guest.tableSessionId,
    tabId: guest.tabId,
  };
}

// --- Chamados (M10) ---------------------------------------------------------

export interface ServiceRequestInput {
  kind: 'call_waiter' | 'request_bill' | 'other';
  note?: string | undefined;
}

export async function createServiceRequest(
  db: Db,
  tenantId: string,
  tableSessionId: string,
  guestId: string,
  input: ServiceRequestInput,
) {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .insert(schema.serviceRequests)
      .values({
        id: newId(),
        tenantId,
        tableSessionId,
        createdByGuestId: guestId,
        kind: input.kind,
        note: input.note ?? null,
      })
      .returning(),
  );
  return row!;
}

export async function listOpenServiceRequests(db: Db, tenantId: string) {
  return withTenant(db, tenantId, (tx) =>
    tx
      .select()
      .from(schema.serviceRequests)
      .where(
        and(
          eq(schema.serviceRequests.tenantId, tenantId),
          inArray(schema.serviceRequests.status, ['open', 'acknowledged']),
        ),
      ),
  );
}

type ServiceRequestTransition = 'acknowledge' | 'done';
const SERVICE_REQUEST_RULES: Record<ServiceRequestTransition, { from: string[]; to: string }> = {
  acknowledge: { from: ['open'], to: 'acknowledged' },
  done: { from: ['open', 'acknowledged'], to: 'done' },
};

export async function transitionServiceRequest(
  db: Db,
  tenantId: string,
  requestId: string,
  userId: string,
  transition: ServiceRequestTransition,
) {
  const rule = SERVICE_REQUEST_RULES[transition];
  return withTenant(db, tenantId, async (tx) => {
    const [updated] = await tx
      .update(schema.serviceRequests)
      .set({ status: rule.to, handledBy: userId })
      .where(
        and(
          eq(schema.serviceRequests.id, requestId),
          eq(schema.serviceRequests.tenantId, tenantId),
          inArray(schema.serviceRequests.status, rule.from),
        ),
      )
      .returning();
    if (updated) return updated;

    // Idempotente: já está (ou passou) do estado alvo — devolve o estado atual em
    // vez de erro, mesmo espírito do bump de ticket do M9.
    const [current] = await tx
      .select()
      .from(schema.serviceRequests)
      .where(
        and(
          eq(schema.serviceRequests.id, requestId),
          eq(schema.serviceRequests.tenantId, tenantId),
        ),
      );
    if (!current) throw new AppError('NOT_FOUND', 'Chamado não encontrado.');
    return current;
  });
}

// --- Comandas abertas (M11, pedido pela equipe) ------------------------------

export interface OpenTabSummary {
  tabId: string;
  tabLabel: string;
  tableId: string;
  tableLabel: string;
}

/** Comandas abertas do tenant, com o rótulo da mesa — para o staff escolher onde lançar um pedido. */
export async function listOpenTabs(db: Db, tenantId: string): Promise<OpenTabSummary[]> {
  return withTenant(db, tenantId, (tx) =>
    tx
      .select({
        tabId: schema.tabs.id,
        tabLabel: schema.tabs.label,
        tableId: schema.tableSessions.tableId,
        tableLabel: schema.tables.label,
      })
      .from(schema.tabs)
      .innerJoin(schema.tableSessions, eq(schema.tableSessions.id, schema.tabs.tableSessionId))
      .innerJoin(schema.tables, eq(schema.tables.id, schema.tableSessions.tableId))
      .where(and(eq(schema.tabs.tenantId, tenantId), eq(schema.tabs.status, 'open'))),
  );
}
