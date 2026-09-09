# Bella OS — QA Ledger (gates e evidências)

> Registro cronológico de gates executados e evidências por frente independente. Formato em `TESTING_STRATEGY.md §7`. Um gate só é PASS com o mínimo de frentes exigido (2 normal, 3 crítico).

## Gates do handoff (referência rápida)
G0 ambiente/identidade · G1 plano · G2 dados/contratos · G3 feature isolada · G4 integração entre áreas · G5 UX/mobile · G6 segurança · G7 dinheiro/comanda/caixa · G8 KDS/realtime · G9 observabilidade/recuperação · G10 release.

---

### 2026-09-09 — M0 Bootstrap — G0 Ambiente e identidade — PASS
Frentes:
- [inspeção] `git status` (repo não existia), `gh auth status` mostrou 3 contas; ativa era `victorlins-dev` → trocada para `Victor-Hugo-Soares`; `gh api user` confirma login ativo.
- [inspeção] `gh repo view Victor-Hugo-Soares/bella-os` → repositório existe, vazio, **público** (ENV-3).
- [inspeção] versões: git 2.55, gh 2.96, node 24.18, npm 11.16, pnpm 10.34.5 (instalado), Docker 29.6 CLI (daemon com falha, ENV-1), Python 3.12.
- [config] identidade local do repo `Victor Hugo <116037876+Victor-Hugo-Soares@users.noreply.github.com>`; id do usuário confirmado por `gh api users/Victor-Hugo-Soares`.
Observações: workspace em OneDrive (ENV-5). Nenhum segredo versionado (`.gitignore` cobre `.env*`).

### 2026-09-09 — M0 Bootstrap — G1 Plano — PASS
Plano: fundação documental + scaffold mínimo verificável. Criticado: escopo limitado ao que Sonnet não faria melhor (arquitetura, modelo, riscos, dinheiro). Sem código de feature.

### 2026-09-09 — M0 Bootstrap — G2 Dados e contratos — PASS (escopo M0)
Frentes:
- [unit] `packages/contracts/test/errors.test.ts`: todo código de erro tem status HTTP; envelope valida/rejeita.
- [unit] `packages/domain/test/money.test.ts`: 18 testes incluindo propriedades (soma das parcelas == total para 640 combinações; rateio para 200 conjuntos de pesos), half-even em empates, parse/format round-trip.
- [inspeção] revisão do código de `money.ts`: nenhum float em cálculo; arredondamento único.
Pendente (M1): migrations e integração com Postgres real; o teste `apps/api/test/integration/db.test.ts` está escrito e roda na CI (job `integration`), mas **não foi executado localmente** por falta de Docker (ENV-1).

### 2026-09-09 — M0 Bootstrap — G3 Feature isolada (API health/ready/erros) — PASS
Frentes:
- [unit/inject] `apps/api/test/health.test.ts` (5 testes): contrato de `/health`, propagação e geração de `x-request-id`, `/ready` degrada honestamente sem banco, 404 em envelope com `request_id`, config rejeita URL inválida.
- [smoke real] API compilada (`pnpm build` → `node apps/api/dist/index.js` com `NODE_ENV=production`): `curl /health` → `{"status":"ok",...}`; `/ready` → `degraded/not_configured [200]`; `/x` → envelope `NOT_FOUND [404]`.
- [regressão de build] primeiro build **falhou no smoke** ("Dynamic require of events": `pg` CommonJS embutido no bundle ESM). Causa raiz: `pg` não era dependência direta da API, então o tsup o embutiu. Correção: `pg` declarado em `apps/api` + `external` explícito no tsup. Re-smoke verde. Registrado como lição: **build verde não prova execução**.
- [lint/typecheck] `pnpm lint`, `pnpm format`, `pnpm typecheck` verdes após correções (NBSP literal em regex; narrowing de tipo; `error: unknown` no handler).

### 2026-09-09 — M0 Bootstrap — G6 Segurança (escopo M0) — PASS parcial
- [inspeção] logger redige `authorization`, `cookie`, `*.password`, `*.pin`, `*.token`.
- [inspeção] CORS `origin: false` até M4; `trustProxy` para Railway.
- [inspeção] `.gitignore` e `.prettierignore` revisados; nenhum arquivo `.env` existe.
Pendente: autenticação/autorização (M2), RLS (M1).

### 2026-09-09 — M0 Bootstrap — G9 Observabilidade mínima — PASS parcial
- [smoke] `request_id` presente no header de resposta e no envelope de erro; pino JSON em produção; `pino-pretty` só em desenvolvimento.
- Pendente: `/ready` com banco real (teste de integração escrito, valida na CI), métricas (M3).

### 2026-09-09 — M0 Bootstrap — CI (frente independente de integração) — FAIL → corrigido
- [CI run 1] `quality` e `build+smoke` verdes; `integração (Postgres 16)` **falhou**: `Can't find meta/_journal.json` — o migrador do Drizzle exige o journal mesmo sem migrations (confirmado no código instalado de `drizzle-orm/migrator.js`, que itera `journal.entries`).
- Correção: `packages/db/migrations/meta/_journal.json` vazio no formato do drizzle-kit 0.31 (`version: "7"`); `afterAll` protegido contra falha no `beforeAll`.
- Resultado da segunda execução da CI: registrado em `PROJECT_STATE.md §4`.

### 2026-09-09 — M0 Bootstrap — Gate Git — ver `PROJECT_STATE.md` (branch/commit)
- [inspeção] diff revisado antes do commit; sem segredos; `docs/source/*.docx` binário marcado em `.gitattributes`.
- CI: workflow criado; resultado da primeira execução registrado em `PROJECT_STATE.md` após o push.

### 2026-09-09 — Gate de Handoff Fable → Sonnet — ver seção final de `PROJECT_STATE.md`

---

## Milestone M1 — Banco, tenant e isolamento (Fase A)

### 2026-09-09 — M1 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` (versão M1) revisado; Gate de Plano respondido antes de codar. Desvios do plano original registrados como decisões, não como "correção silenciosa": ADR-020 (um papel de banco em vez de dois), ADR-021 (RLS via DSL do drizzle-orm em vez de SQL manual).

### 2026-09-09 — M1 — G2 Dados e contratos — PASS
Frentes:
- [inspeção] schema revisado: 12 tabelas, `tenant_id NOT NULL` em toda tabela de negócio (DOMAIN_MODEL.md §1.1, 1.2, 1.8); `role_permissions.tenant_id` denormalizado de propósito para manter a política de RLS uniforme.
- [migration] `drizzle-kit generate` a partir de banco vazio (sem conexão — só diff de schema) + `drizzle-kit check` limpo (sem colisão de snapshot).
- [integração — CI, Postgres 16 real] `db.test.ts` (M0, 6 testes: conexão, migrator, `withTenant`/`withoutTenant`, concorrência de contexto) — verde.
- [integração — CI] `tenant-isolation.test.ts` (9 testes, critérios a–d do plano):
  - **(a)** `bella_app` sob contexto do tenant Bella nunca vê `roles` do tenant Demo (via Drizzle **e** via SQL bruto `count(*) where tenant_id = demo`); o inverso também provado.
  - **(b)** `INSERT` em `roles` com `tenant_id` divergente do contexto é rejeitado pela *policy* (mensagem real do Postgres inspecionada via `error.cause`, não via `.message` do wrapper do drizzle-orm — ver ADR abaixo); nada persistido.
  - **(c)** sem `app.tenant_id` definido, `SELECT` em `roles`, `memberships`, `tenant_settings`, `domain_events`, `idempotency_keys` devolve zero linhas mesmo havendo dados.
  - **(d)** `pg_roles.rolbypassrls`/`rolsuper` de `bella_app` são `false`; `bella_app` não é dono de `tenants`/`roles`; `pg_class.relrowsecurity` confirma RLS ligada nas 8 tabelas de negócio e desligada nas 3 globais.
- [integração — CI] `audit-outbox.test.ts` (4 testes, critérios e–f):
  - **(e)** mutação (criar papel) + `audit_log` + `domain_events` persistem juntos na mesma transação; segundo teste força uma violação de `NOT NULL` no meio da transação e prova que **nada** sobrevive (atomicidade real, não só no papel).
  - **(f)** `idempotency_keys` UNIQUE `(tenant_id, scope, key)`: mesma chave no mesmo escopo é rejeitada pelo banco; mesma chave em escopos diferentes é permitida.
- [unit] `set-app-role-password.test.ts` (3 testes, `pg.Client` mockado): a query nunca contém `$1`; senha com aspas simples aparece escapada; senha curta é rejeitada antes de abrir conexão.
- [unit] `permissions.test.ts` (8 testes) e `id.test.ts` (4 testes) em `@bella/domain`.
- **Total CI final:** `lint · format · typecheck · unit` verde, `integração (Postgres 16)` **19/19 testes verdes** em 3 arquivos, `build + smoke` verde.

**Regressões reais encontradas e corrigidas durante o processo (não hipotéticas — a CI pegou de verdade):**
1. `ALTER ROLE bella_app WITH LOGIN PASSWORD $1` falhou com `syntax error at or near "$1"` — DDL do Postgres não aceita bind parameter nessa posição. Corrigido com `pg.escapeLiteral` (ADR-022); teste de regressão adicionado.
2. Duas asserções de teste esperavam a causa do erro em `error.message`, mas `drizzle-orm` envolve o erro real do Postgres em `DrizzleQueryError` cujo `.message` de topo é genérico ("Failed query: ..."); a causa real fica em `.cause`. Corrigido com helper `expectPgErrorMatching()`. **Isto não era um bug de isolamento** — 17 dos 19 testes já passavam na mesma execução, provando que a RLS funcionava; era só a asserção de teste checando o campo errado.

### 2026-09-09 — M1 — G6 Segurança (RLS/tenant) — PASS
Ver testes (a)–(d) acima. Evidência de 3+ frentes para mudança crítica de tenant/segurança: integração via ORM, integração via SQL bruto, inspeção de catálogo do Postgres (`pg_roles`, `pg_tables`, `pg_class`).

### 2026-09-09 — M1 — Gate Git — PASS
PR #1 (`claude/m1-banco-tenant` → `main`), 3 commits (feature + 2 correções encontradas pela própria CI), diff revisado, sem segredos (`.env.example` só tem senha de desenvolvimento local documentada como tal), CI verde nos 3 jobs antes do merge. Merge commit `ba348bd`.
