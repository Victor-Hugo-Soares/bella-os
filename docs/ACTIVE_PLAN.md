# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.1–1.2 e §3 → `ARCHITECTURE.md` §4 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

## Milestone atual: **M1 — Banco, tenant e isolamento** (Fase A)

### Problema
Não existe nenhuma tabela. Precisamos da fundação de dados que todo o resto assume: tenants, configurações tipadas, identidade mínima, papéis/permissões, auditoria, outbox de eventos, idempotência e jobs, com **isolamento entre tenants provado** por aplicação e por RLS.

### Resultado esperado
1. `pnpm db:migrate` em banco vazio cria todas as tabelas abaixo sem erro; rodar duas vezes é idempotente.
2. `pnpm db:seed` cria dois tenants (`bella` = "Bella III", `demo` = "Restaurante Demo"), papéis padrão com permissões, um usuário dono por tenant (senha só via variável de seed; nunca hardcode em produção), configurações padrão de cada tenant.
3. Testes de integração provam: (a) uma query com contexto do tenant A **não vê** linhas do tenant B mesmo com SQL direto (`select * from roles`), (b) insert com `tenant_id` diferente do contexto é rejeitado pela policy, (c) sem contexto (`app.tenant_id` vazio) nenhuma linha de tabela de negócio é visível, (d) usuário de aplicação não tem `BYPASSRLS` e não é owner das tabelas, (e) `audit_log` e `domain_events` recebem linhas na mesma transação de uma mutação de exemplo, (f) `idempotency_keys` tem UNIQUE `(tenant_id, scope, key)` (inserção duplicada falha).
4. `docs/DOMAIN_MODEL.md §1.1, 1.2, 1.8` atualizados se o schema divergir do planejado (documentar a razão).

### Arquivos envolvidos
- `packages/db/src/schema/*.ts` (um arquivo por domínio: `platform.ts`, `tenants.ts`, `identity.ts`); `packages/db/src/schema/index.ts` reexporta.
- `packages/db/migrations/0000_*.sql` gerado por `pnpm db:generate` **+** migration manual `0001_rls.sql` (policies, revogações, triggers) — Drizzle não gera RLS/roles; escrever SQL à mão e registrar em `migrations/meta` via `drizzle-kit generate --custom`.
- `packages/db/src/seed/index.ts` + script `db:seed` (raiz e pacote).
- `packages/db/src/roles.sql` ou migration: papel `bella_app` (LOGIN, sem BYPASSRLS) usado pela API; `bella_migrator` (owner) usado por migrations. Em dev/CI ambos existem no compose (`docker/postgres-init/02-roles.sql`).
- `packages/domain/src/permissions.ts`: lista de chaves de permissão + papéis padrão (fonte única; seed lê daqui).
- `apps/api/test/integration/tenant-isolation.test.ts`, `apps/api/test/integration/audit-outbox.test.ts`.
- `docs/RUNBOOK_DEV.md` (novos comandos), `docs/QA_LEDGER.md`, `docs/PROJECT_STATE.md`.

### Arquitetura / regras
- Tabelas (ver `DOMAIN_MODEL.md`): `organizations`, `tenants`, `tenant_settings`, `platform_admins`, `users`, `roles`, `role_permissions`, `memberships`, `audit_log`, `domain_events`, `idempotency_keys`, `jobs`. **Não** criar ainda: dispositivos, PIN, mesas, catálogo (M3, M5, M6).
- `users` é global (sem `tenant_id`); vínculo com tenant é `memberships`. Better Auth (M2) vai precisar de colunas próprias: **antes de fechar `users`, ler a documentação atual do Better Auth + adapter Drizzle e alinhar nomes de colunas** para não migrar duas vezes. Se a integração for incerta, deixar `users` mínimo (`id, email, name, status, created_at`) e permitir que o M2 adicione colunas.
- IDs: `uuid` gerado na aplicação com UUID v7 (biblioteca `uuidv7` ou `crypto.randomUUID()` v4 se v7 não estiver disponível de forma confiável — registrar decisão). Default no banco `gen_random_uuid()` como fallback.
- Timestamps `timestamptz` default `now()`. Dinheiro `bigint`. Status `text` + `CHECK`.
- RLS: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY; FORCE ROW LEVEL SECURITY;` em toda tabela com `tenant_id`; policy única `USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (idem)`. Tabelas globais (`users`, `organizations`, `platform_admins`) sem RLS por tenant, acesso só via serviço.
- `ledger`-style append-only ainda não existe (M12), mas `audit_log` e `domain_events` já devem ter `REVOKE UPDATE, DELETE ... FROM bella_app`.
- `domain_events.seq bigserial` + índice `(tenant_id, seq)`; `channel text`.
- `idempotency_keys`: `UNIQUE (tenant_id, scope, key)`, `request_hash text`, `response_status int`, `response_body jsonb`, `expires_at`.
- `jobs`: `status`, `run_at`, `locked_at`, `locked_by`, `attempts`, índice parcial `WHERE status = 'pending'`.
- Helper `withTenant()` já existe em `packages/db/src/tenant-context.ts`; adicionar `withoutTenant()` explícito para operações de plataforma, com log de auditoria.

### Banco
Compose local (`pnpm db:up`) ou fallback do runbook. CI já tem Postgres em service container e roda `test:integration`.

### Riscos
- RLS "parecendo" funcionar porque o usuário é owner → teste (d) obrigatório.
- Seed com senha fixa vazando para produção → seed só roda com `NODE_ENV !== 'production'` ou flag explícita; senha vem de `SEED_OWNER_PASSWORD` com default apenas em dev.
- Divergência de schema do Better Auth (R-2) → checar docs antes de fixar `users`.
- Migration manual fora do controle do Drizzle → usar `drizzle-kit generate --custom` para que o migrator aplique na ordem.

### Segurança
Dois papéis de banco; nenhum segredo no repositório; `.env.example` atualizado com `DATABASE_URL` (app) e `MIGRATION_DATABASE_URL` (migrator) se optar por credenciais separadas já em dev (recomendado, para que o teste (d) seja real).

### Testes (mínimo 3 frentes — mudança crítica: tenant/permissão)
1. Integração: suíte de isolamento (a–f) via Drizzle e via SQL direto.
2. Inspeção independente: consulta `pg_policies`, `pg_roles.rolbypassrls`, `information_schema.table_privileges` dentro do teste **e** manualmente com `psql`/cliente, registrada no `QA_LEDGER.md`.
3. Migration em banco vazio (CI) + migration sobre banco já migrado (idempotência) + `pnpm db:check`.
4. Unit: `permissions.ts` (cada papel padrão só tem chaves existentes; dono tem todas).

### Critérios de aceite
- [ ] `pnpm db:migrate` idempotente em banco vazio e já migrado.
- [ ] `pnpm db:seed` cria 2 tenants, papéis, permissões, 1 dono por tenant; rodar de novo não duplica (upsert por slug/email).
- [ ] Testes (a)–(f) verdes local (se Docker funcionar) **e** na CI.
- [ ] `pnpm check` verde; CI verde no PR.
- [ ] `DOMAIN_MODEL.md` e `RUNBOOK_DEV.md` atualizados; `QA_LEDGER.md` com evidências das 3+ frentes; `PROJECT_STATE.md` atualizado; próximo plano (M2) escrito aqui.

### Rollback
Migrations são novas tabelas; rollback = `drop schema public cascade` em dev. Nenhum dado real existe.

### Dependências / impacto
Nenhuma dependência externa. Impacta todos os milestones seguintes (tudo referencia `tenants`).

### Gate de Plano (respondido em 2026-09-09)
Problema entendido pelo comportamento (isolamento provado, não só tabelas criadas) · não há solução menor que preserve RLS · afeta banco e segurança · falhas plausíveis: owner ignora RLS, seed em produção, `set_config` fora de transação vazando entre requests (pool) · prova por integração + SQL + CI · rollback trivial · multi-tenant preservado, Bella é seed.

## Próximos milestones (resumo; detalhes em `ROADMAP.md`)
M2 auth staff (Better Auth) e permissões → M3 dispositivos, PIN, observabilidade → M4 web shell + login + design system → Fase B.
