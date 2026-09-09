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

---

## Milestone M2 — Auth staff, papéis, permissões (Fase A)

### 2026-09-09 — M2 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` (versão M2) já continha a pesquisa da versão/API do Better Auth feita na sessão anterior; reconfirmada contra os tipos instalados e a própria CLI antes de escrever qualquer rota (regra 12 do CLAUDE.md). Gate de Plano respondido antes de codar.

### 2026-09-09 — M2 — G2/G3 Dados, contratos e feature — PASS
Frentes:
- [inspeção de tipos instalados] `drizzleAdapter` (`usePlural`, `schema`), `pgRole`/`pgPolicy` (já usados no M1), `advanced.database.generateId` — todos confirmados lendo `.d.mts` reais, não de memória.
- [execução real da CLI] `pnpm exec auth generate` rodado contra `apps/api/src/modules/identity/auth.ts` duas vezes (uma vez sem `usePlural`, confirmando singular; outra com, confirmando plural) — schema de `sessions`/`accounts`/`verifications` e colunas novas de `users` vieram da ferramenta, não de suposição.
- [migração] duas migrations separadas (`0001` adição pura de `sessions`/`accounts`/`verifications`/`users.email_verified`/`users.image`; `0002` remoção pura de `users.password_hash`) para evitar o prompt interativo de "rename?" do drizzle-kit ao misturar adição e remoção — `drizzle-kit check` limpo depois de ambas.
- [unit] typecheck de todo o monorepo limpo após renomear chaves de `_columns.ts` para camelCase; confirmado que a mudança não gera diff de migration (colunas rastreadas pelo nome SQL).
- [smoke real] `pnpm build` gerou bundle de 41,5 KB (contra 188 KB do M0 quando `pg` foi acidentalmente embutido) — confirma que `better-auth`/`@better-auth/drizzle-adapter` ficaram como `external`, não embutidos; servidor compilado iniciou sem erro com `DATABASE_URL` ausente e com uma `DATABASE_URL` inalcançável, `/health` e `/ready` responderam corretamente, `/v1/me` sem sessão devolveu 401 estruturado, `/api/auth/sign-up/email` respondeu (não 404 — rota wired).
- [integração — CI, Postgres 16 real, conectando como `bella_app`] `auth.test.ts` (6 testes): sign-up cria sessão; sign-in correto funciona e `/v1/me` devolve o usuário certo; senha errada e usuário inexistente são rejeitados (400s, não 500); `/v1/me` sem sessão é 401; sign-out invalida a sessão; usuário aparece para o dono do banco via consulta independente.
- [integração — CI] `require-permission.test.ts` (6 testes, critério 3 do plano): sem sessão → UNAUTHENTICATED; sessão sem `X-Tenant-Id` → TENANT_MISMATCH; sessão + tenant sem membership → TENANT_MISMATCH (mesma resposta de "não existe" e "desativado", não vaza); positivo (`cashier` consegue `payments.record`); dois negativos (`cashier` não consegue `users.manage` nem `orders.cancel.after_production`).

**Achado real corrigido durante o processo (não hipotético):** a API (`index.ts`) ainda conectava como o DONO do banco (herdado do M0/M1, quando não havia módulo de negócio nenhum) — ignoraria RLS em produção, anulando o isolamento do M1. Descoberto ao escrever os testes de integração do M2 (perguntando "com qual conexão a API real deveria rodar?"). Corrigido: `index.ts` agora usa `APP_DATABASE_URL` (`bella_app`), com aviso alto se cair para `DATABASE_URL`. Ver ADR-024.

### 2026-09-09 — M2 — G6 Segurança (autenticação/autorização/tenant) — PASS
Evidência de 3+ frentes para mudança crítica (autenticação + permissão + tenant): testes de integração via HTTP real (transporte), `resolveActor`/`requirePermission` contra banco real conectado como `bella_app` (não o dono — a mesma lição do M1 aplicada de novo), inspeção do bundle de produção (nada embutido incorretamente). Positivo e negativo cobertos para dois papéis (`cashier` vs. permissões de `owner`/gerência).

### 2026-09-09 — M2 — CI run 1 (frente independente de integração) — FAIL → corrigido
- [CI run 1] `quality` e `build+smoke` verdes; `integração (Postgres 16)` **falhou**: 4 de 32 testes — `sign-up`/`sign-in` chegavam ao Better Auth com corpo `undefined` ("[body] Invalid input: expected object, received undefined").
- Causa raiz: `addContentTypeParser('*', ...)` sozinho não sobrescreve o parser default de `application/json` — o Fastify guarda o wildcard sob uma chave própria (`''`) e só recorre a ela quando não há parser específico para o content-type; `application/json` já tinha um parser (herdado por cópia do Map ao encapsular o plugin), então ele sempre vencia. Confirmado lendo `fastify/lib/content-type-parser.js` (`getParser`/`existingParser`) depois do erro real na CI — não foi hipótese, foi diagnóstico via leitura do código-fonte instalado após reproduzir a falha.
- Correção: `application/json` sobrescrito explicitamente (além do wildcard `'*'`) com o mesmo parser de passagem em buffer, escopado ao plugin `identityRoutes`.
- Resultado da segunda execução: registrado abaixo assim que confirmado.

### 2026-09-09 — M2 — CI run 2 — PASS
- `lint · format · typecheck · unit`: verde. `integração (Postgres 16)`: **32/32 testes verdes em 5 arquivos** (db, tenant-isolation, audit-outbox do M1 + auth, require-permission do M2). `build + smoke`: verde.
- PR #2 mergeado em `main` (`c9bf056`).

### 2026-09-09 — M2 — Gate Git — PASS
PR #2 (`claude/m2-auth-staff` → `main`), 2 commits de código (feature + correção de bug real de content-type encontrada pela CI) + 1 de docs, diff revisado, sem segredos, CI verde nos 3 jobs antes do merge.

---

## Milestone M3 — Dispositivos, PIN e observabilidade mínima (Fase A)

### 2026-09-09 — M3 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` (versão M3) revisado. Pesquisa de biblioteca de hash feita e testada de verdade (hash+verify reais com `@node-rs/argon2`) antes de escrever qualquer código de produção (regra 12).

### 2026-09-09 — M3 — G2/G3/G6 Dados, feature e segurança — PASS
Frentes:
- [inspeção] schema `devices`/`pairing_codes` revisado; decisão de não usar RLS documentada com o motivo técnico exato (ADR-025), não como atalho.
- [migração] `drizzle-kit generate`/`check` limpos.
- [unit] `pin.test.ts` (6 testes) e `device-token.test.ts` (7 testes) em `@bella/domain`: hash/verify de PIN, unicidade e determinismo do hash de token, formato do código de pareamento.
- [smoke real — regressão de build encontrada e corrigida] `pnpm build` falhou de verdade duas vezes em sequência: (1) esbuild tentando resolver estaticamente binários `.node` de todas as plataformas do `@node-rs/argon2` — corrigido com `external` no tsup; (2) mesmo `external`, o bundle compilado não resolvia o pacote em runtime (`ERR_MODULE_NOT_FOUND`) por causa do isolamento de `node_modules` do pnpm — corrigido declarando `@node-rs/argon2` como dependência direta também de `apps/api`. Ambos só apareceram rodando o binário de verdade, não no `tsc`/`pnpm build` sozinhos — reforça a lição do M0 (ADR-026).
- [integração — CI, Postgres 16 real, conectando como `bella_app`] `devices.test.ts` (7 testes): pareamento completo (gerar código → trocar por token → token funciona numa rota real); código usado duas vezes rejeitado; código expirado rejeitado; token revogado para de funcionar; dispositivo de um tenant não verifica PIN de membership de outro tenant (RLS de `memberships` continua protegendo mesmo com `devices` sem RLS); geração sem permissão negada; geração em sequência nunca falha por colisão sem tratamento; inspeção independente confirma que só o hash do token é gravado, nunca o valor puro.
- [integração — CI] `pin.test.ts` (5 testes): PIN certo verifica; PIN errado nega e conta tentativa; 5 tentativas erradas bloqueia (6ª tentativa nega mesmo com PIN certo); bloqueio expirado (simulado) permite verificar de novo e zera o contador; membership sem PIN configurado é negado sem tentar comparar hash inexistente.
- **Total esperado:** 44 testes de integração (32 do M1+M2 + 12 novos) em 7 arquivos — resultado real da CI registrado em `PROJECT_STATE.md` assim que confirmado.

### 2026-09-09 — M3 — CI run 1 (frente independente de integração) — FAIL → corrigido
- [CI run 1] `quality` e `build+smoke` verdes; `integração (Postgres 16)` **falhou**: 4 de 45 testes.
- **Bug real 1 (produção):** `verifyMembershipPin` lançava `AppError` de **dentro** da mesma transação que gravava a tentativa de PIN incorreta (`pinFailedAttempts`). O Postgres reage a uma exceção não capturada dentro de `db.transaction()` com `ROLLBACK` — desfazendo exatamente o registro que deveria persistir. Resultado: a 5ª tentativa nunca bloqueava porque nenhuma tentativa anterior tinha sido de fato gravada (a CI provou isso: "PIN errado é negado" tinha `pinFailedAttempts` sempre 0; "bloqueia depois de 5 tentativas" resolvia com sucesso na 6ª em vez de rejeitar). Corrigido: a transação sempre retorna um resultado (nunca lança), e quem decide lançar `AppError` é o código de fora, depois do commit.
- **Teste desatualizado (não é bug de produção):** o teste antigo do M0 (`db.test.ts`, `/ready`) usava `toEqual` com igualdade exata, quebrado pelo novo campo `database_latency_ms` do M3. Corrigido para checar os campos relevantes sem fixar o valor da latência.
- **Teste com asserção insuficiente:** "dispositivo de um tenant não consegue verificar PIN..." falhava com "invalid value undefined for header x-device-token" — sintoma de uma etapa anterior (criar/trocar código para o tenant Demo) ter falhado silenciosamente, sem uma asserção de status intermediária para revelar a causa real. Corrigido adicionando `expect(...).toBe(200/201)` com o corpo da resposta em todos os pontos de desestruturação do arquivo — próxima execução da CI mostra a causa real caso persista.

### 2026-09-09 — M3 — CI run 2 (frente independente de integração) — FAIL → corrigido
- [CI run 2] a asserção de diagnóstico adicionada na correção anterior funcionou exatamente como pretendido: revelou a causa real em vez de um sintoma. `criar código para o Demo falhou: TENANT_MISMATCH` — a membership do "dono do Demo" criada no `beforeAll` apontava para o papel `owner` do **Bella**, não do Demo.
- **Causa raiz (bug de setup de teste, não de produção):** `withTenant(ownerDb.db, tenantId, ...)` não filtra nada — `ownerDb` é o dono do banco, que ignora RLS. A consulta de papéis sem `WHERE tenant_id = ...` explícito devolvia papéis de TODOS os tenants, e `.find(r => r.name === 'owner')` pegava o primeiro que o Postgres retornasse (o do Bella, seedado primeiro), mesmo pedindo o papel do Demo.
- Corrigido em `devices.test.ts`, `pin.test.ts`, `require-permission.test.ts` (`.where(eq(schema.roles.tenantId, tenantId))` explícito). Auditados `tenant-isolation.test.ts`/`audit-outbox.test.ts` (M1): não tinham o problema, pois suas asserções de isolamento já usavam `appDb` (a conexão restrita). Ver ADR-027.
