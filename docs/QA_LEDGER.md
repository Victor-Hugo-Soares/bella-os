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
- **Total confirmado na CI (run 3, verde): 45/45 testes de integração em 7 arquivos.**

### 2026-09-09 — M3 — CI run 3 — PASS
`lint · format · typecheck · unit`: verde. `integração (Postgres 16)`: **45/45 testes verdes em 7 arquivos**. `build + smoke`: verde. PR #3 mergeado em `main` (`a751062`).

### 2026-09-09 — M3 — Gate Git — PASS
PR #3 (`claude/m3-devices-pin` → `main`), 3 commits de código (feature + 2 correções de bugs reais encontrados pela própria CI: transação de PIN e escopo de tenant no setup de teste) + docs, diff revisado, sem segredos, CI verde nos 3 jobs antes do merge.

### 2026-09-09 — M3 — CI run 1 (frente independente de integração) — FAIL → corrigido
- [CI run 1] `quality` e `build+smoke` verdes; `integração (Postgres 16)` **falhou**: 4 de 45 testes.
- **Bug real 1 (produção):** `verifyMembershipPin` lançava `AppError` de **dentro** da mesma transação que gravava a tentativa de PIN incorreta (`pinFailedAttempts`). O Postgres reage a uma exceção não capturada dentro de `db.transaction()` com `ROLLBACK` — desfazendo exatamente o registro que deveria persistir. Resultado: a 5ª tentativa nunca bloqueava porque nenhuma tentativa anterior tinha sido de fato gravada (a CI provou isso: "PIN errado é negado" tinha `pinFailedAttempts` sempre 0; "bloqueia depois de 5 tentativas" resolvia com sucesso na 6ª em vez de rejeitar). Corrigido: a transação sempre retorna um resultado (nunca lança), e quem decide lançar `AppError` é o código de fora, depois do commit.
- **Teste desatualizado (não é bug de produção):** o teste antigo do M0 (`db.test.ts`, `/ready`) usava `toEqual` com igualdade exata, quebrado pelo novo campo `database_latency_ms` do M3. Corrigido para checar os campos relevantes sem fixar o valor da latência.
- **Teste com asserção insuficiente:** "dispositivo de um tenant não consegue verificar PIN..." falhava com "invalid value undefined for header x-device-token" — sintoma de uma etapa anterior (criar/trocar código para o tenant Demo) ter falhado silenciosamente, sem uma asserção de status intermediária para revelar a causa real. Corrigido adicionando `expect(...).toBe(200/201)` com o corpo da resposta em todos os pontos de desestruturação do arquivo — próxima execução da CI mostra a causa real caso persista.

### 2026-09-09 — M3 — CI run 2 (frente independente de integração) — FAIL → corrigido
- [CI run 2] a asserção de diagnóstico adicionada na correção anterior funcionou exatamente como pretendido: revelou a causa real em vez de um sintoma. `criar código para o Demo falhou: TENANT_MISMATCH` — a membership do "dono do Demo" criada no `beforeAll` apontava para o papel `owner` do **Bella**, não do Demo.
- **Causa raiz (bug de setup de teste, não de produção):** `withTenant(ownerDb.db, tenantId, ...)` não filtra nada — `ownerDb` é o dono do banco, que ignora RLS. A consulta de papéis sem `WHERE tenant_id = ...` explícito devolvia papéis de TODOS os tenants, e `.find(r => r.name === 'owner')` pegava o primeiro que o Postgres retornasse (o do Bella, seedado primeiro), mesmo pedindo o papel do Demo.
- Corrigido em `devices.test.ts`, `pin.test.ts`, `require-permission.test.ts` (`.where(eq(schema.roles.tenantId, tenantId))` explícito). Auditados `tenant-isolation.test.ts`/`audit-outbox.test.ts` (M1): não tinham o problema, pois suas asserções de isolamento já usavam `appDb` (a conexão restrita). Ver ADR-027.

---

## Milestone M4 — Web shell, login e design system (Fase A)

### 2026-09-09 — M4 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` (versão M4) revisado. Versões confirmadas ao vivo via npm antes de codar (regra 12): `next@16.3.4`, `react@19.3.0`, `tailwindcss@4.3.3`, CLI de componentes é `shadcn` (não `shadcn-ui`).

### 2026-09-09 — M4 — G3/G5 Feature e UX/mobile — PASS
Frentes:
- [build real] `next build` (Turbopack) compila e gera as 6 rotas esperadas (`/`, `/admin/login`, `/admin/dashboard`, `/kds`, `/[tenant]/m/[table]`, `/_not-found`); `next start` roda o servidor de produção compilado (não só `next dev`) e responde 200.
- [inspeção de tipos/CLI instalados] `PageProps<'/rota'>`/`LayoutProps` gerados por `next typegen`, confirmados lendo `.next/types/` depois de rodar a ferramenta — não presumidos da memória.
- [fontes, evidência real de browser] `document.fonts.check('600 16px "Schibsted Grotesk"')`, `'500 14px "Switzer"'` e `'400 13px "JetBrains Mono"'` retornaram `true` num browser real (Claude Browser tool) depois de carregar `/admin/login` — as três origens (Google Fonts × 2 famílias, Fontshare × 1) confirmadas separadamente, não só "parece a fonte certa visualmente".
- [visual, duas larguras] `/admin/login` inspecionado em viewport desktop e mobile; paleta oklch dark aplicada (fundo `--background`, cartão `--surface`, botão `--brand`), tokens do `FRONTEND_GUIDELINES.md` presentes no DOM computado, não só na folha de estilo.
- [E2E manual real, dois processos] API (`apps/api`, porta 3001) e web (`apps/web`, porta 3200) rodando como processos separados de verdade — não same-origin/proxy. CORS provado: requisição `OPTIONS` preflight → `204`, cookie de sessão aceito entre origens com `WEB_ORIGIN` configurado na API e `credentials: 'include'` no fetch do browser (`read_network_requests` inspecionado, não só "a tela carregou").
- [tratamento de erro, achado real] mensagem de erro da API não aparecia na tela mesmo com o `fetch` recebendo o corpo certo — `authFetch()` só reconhecia o formato plano do Better Auth (`{ message }`), não o nosso envelope aninhado (`{ error: { message } }`) que aparece quando a requisição nem chega ao Better Auth (ex.: 404 do próprio Fastify). Corrigido `extractErrorMessage()` para checar as duas formas. Ver ADR-028.
- [achado de processo, não bug de código] depois de corrigir e reconstruir, o `next start` que já estava rodando não reconheceu o rebuild (nomes de chunk no navegador não batiam com os arquivos novos em disco) — reiniciado o processo sobre o build novo confirmou a correção funcionando de verdade (mensagem específica "Rota não encontrada: POST /api/auth/sign-in/email" apareceu na tela). Ver ADR-028 — lição registrada para nunca reusar um `next start`/`node dist/index.js` já em execução depois de um rebuild durante smoke manual.
- [regressões de monorepo encontradas e corrigidas] `create-next-app` gerou um `pnpm-workspace.yaml` duplicado dentro de `apps/web`, conflitando com o da raiz — deletado, `ignoredBuiltDependencies` mesclado na raiz. `next typegen` precisou ser adicionado ao script `typecheck` de `apps/web` para o `tsc --noEmit` isolado (rodado por `pnpm -r typecheck`) enxergar os tipos de rota gerados pelo App Router. `apps/web/.gitignore` (padrão do `create-next-app`) ignorava `.env.local.example` junto com `.env*` — corrigido com exceção `!.env.local.example`, senão o template de variáveis de ambiente nunca seria versionado.
- **Escopo não coberto (limitação real, não escondida):** sem Postgres local disponível (Docker Desktop com falha, ENV-1), não foi possível testar um login **bem-sucedido** de ponta a ponta contra dados reais — só a mecânica de CORS/cookie, os estados de erro/loading, e a integração de transporte com uma instância da API sem `DATABASE_URL` (que responde 404 estruturado nas rotas de auth, por design). Login bem-sucedido → dashboard com dado real fica como verificação pendente para a primeira vez que houver Postgres acessível (local pós-reboot ou o primeiro ambiente de staging).

### 2026-09-09 — M4 — Decisão de escopo: Playwright adiado — registrado
`ACTIVE_PLAN.md` (M4) deixava em aberto se Playwright entraria neste milestone. Decisão: **adiado**. Só existe uma tela real (login) e nenhum dado de teste local (Postgres indisponível) para popular um fluxo de sucesso automatizado — instalar Playwright agora testaria principalmente estados de erro, não o Golden Journey. Evidência de E2E deste milestone veio de testes manuais reais via browser (Claude Browser tool: rede, console, DOM computado inspecionados, não só captura de tela). Playwright entra quando houver Postgres acessível de forma confiável (CI já tem; ambiente de desenvolvimento local ainda não) e mais de uma tela para justificar automação — reavaliar no M5/M6.

### 2026-09-09 — M4 — `pnpm check` + build do monorepo — PASS
`pnpm check` (lint + format + typecheck + unit) verde para as 7 packages/apps, incluindo `apps/web` pela primeira vez. `pnpm build` verde (Next.js + tsup). CI (`ci.yml`) já cobre `apps/web` sem nenhuma mudança de workflow — os scripts da raiz (`pnpm -r --if-present ...`, `eslint .`, `prettier --check .`) já são recursivos/globais por design desde o M0.

### 2026-09-09 — M4 — Gate Git — PASS
PR #4 (`claude/m4-web-shell` → `main`), CI remota verde nos 3 jobs (lint·format·typecheck·unit, integração Postgres, build+smoke), merge commit `08da6fd`.

---

## Milestone M4.1 — Refinamento visual (feedback direto do Victor)

### 2026-09-09 — M4.1 — G5 UX — PASS
Contexto: Victor testou a tela de login já mergeada e apontou "cara de IA" — diagnóstico correto por `FRONTEND_GUIDELINES.md §1` (o teste do template de IA não estava sendo aplicado, só os tokens de cor/fonte). Ver ADR-029.
Frentes:
- [visual, browser real] login redesenhado em split-screen (marca própria `BellaMark` + headline + grid/glow à esquerda, formulário com ícones Lucide à direita); capturado em desktop (1280px) e mobile (375px, painel de marca oculto por `lg:hidden`, testado de verdade, não só CSS lido).
- [visual, browser real] dashboard redesenhado como início de shell de app (barra superior com marca/tenant/sair, lista de dados com ícones, indicador "Sessão ativa" com ponto de cor) — inspecionado renderizado com dado de exemplo via um servidor Node mínimo local só para popular `/v1/me` (não há Postgres local, ENV-1; nenhum código de produção alterado para este teste).
- [regressão encontrada e corrigida] `.font-mono-tabular` nunca aplicava a família JetBrains Mono, só `tabular-nums` — bug existente desde o M4, só percebido ao inspecionar fonte por família real via `document.fonts`. Corrigido; confirmado com `document.fonts.check(spec, textoRealDaTela)` (sem o texto, o `check()` dá falso-negativo por causa dos múltiplos `@font-face` de subset que o `next/font` gera — lição registrada, não é bug de fonte).
- [build real] `pnpm check` e `pnpm build` verdes no monorepo inteiro após as mudanças.
- **Escopo:** puramente visual/estrutural, sem mudança de contrato de API, permissão ou dado — não exige 3 frentes (não é dinheiro/comanda/autenticação/tenant), 2 frentes (visual real + build) suficientes.

---

## Milestone M5 — Catálogo (API + admin, Fase B)

### 2026-09-09 — M5 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` (versão M5) escreveu o escopo cortado explicitamente antes de codar: CRUD completo de `stations`/`categories`/`products`; API pronta (sem UI) de `modifier_groups`/`modifiers`/vínculo produto↔grupo; `product_images`/`pizza_flavor_groups` fora do milestone. Gate de Plano respondido no próprio arquivo.

### 2026-09-09 — M5 — G2 Dados/contratos — PASS
Frentes:
- [schema] `packages/db/src/schema/catalog.ts`: 6 tabelas, todas com `tenant_id` + `tenantIsolationPolicy` (ADR-021) — nenhuma exceção como `devices` (ADR-025), confirmado que não havia motivo para exceção aqui (sempre há tenant conhecido no contexto da requisição).
- [migração] `drizzle-kit generate`/`check` limpos; migration `0004` inspecionada linha a linha (ordem: tabelas → FKs → índices → policies, mesmo padrão do M1).
- **Achado real de arquitetura durante a implementação:** `GET /v1/me/tenants` (necessário para o front descobrir o tenant ativo sem seletor de UI) não funcionava com `withoutTenant()` — `memberships` tem RLS por tenant, então sem `app.tenant_id` a policy de isolamento não deixa nenhuma linha visível (comportamento correto, mas bloqueava a própria descoberta do tenant). Corrigido com uma segunda policy permissiva (`selfLookupPolicy`, só `SELECT`, filtrando por `app.user_id`) que o Postgres combina com OR à policy de tenant — não é bypass, só autoconsulta. Ver ADR-030.

### 2026-09-09 — M5 — G3/G6 Feature, permissão e segurança — PASS
Frentes (`apps/api/test/integration/catalog.test.ts`, roda contra Postgres real na CI, API conectada como `bella_app`):
- fluxo feliz: `owner` cria estação → categoria → produto vinculado; produto aparece na listagem.
- validação cruzada: produto rejeita `categoryId` de outro tenant mesmo com `stationId` válido do tenant certo (`VALIDATION_ERROR`, 400) — prova que a checagem de pertencimento ao tenant é por FK individual, não só "algum id existe".
- toggle de disponibilidade (`PATCH .../availability`) funciona isoladamente da edição geral; desativar (`isActive=false`) tira da listagem padrão mas a linha **continua no banco** (`?includeInactive=true` ainda mostra) — prova de que não existe DELETE físico.
- negativo: papel `kitchen` (só tem `kitchen.operate` no seed) recebe 403 ao tentar `catalog.manage`.
- isolamento entre tenants: produto criado no Bella não aparece na listagem do Demo, mesmo com um dono do Demo autenticado de verdade fazendo a consulta (não é só "a query não pediu", é "a RLS não deixaria mesmo que pedisse").
- grupos de modificador/modificadores/vínculo produto↔grupo: criar, vincular a um produto real, desvincular — API pronta para quando a UI existir (M6/M7), sem exigir migração nova depois.
- `GET /v1/me/tenants`: devolve o tenant certo sem `X-Tenant-Id`, não vaza o tenant Demo (onde o usuário não tem membership), 401 sem sessão.
- **Total:** 9 testes novos em `catalog.test.ts`, cobrindo positivo/negativo de permissão e isolamento — suficiente para 2 frentes (catálogo não é dinheiro/comanda/autenticação/tenant crítico no sentido do handoff; é dado estruturado com permissão), mas o teste de isolamento entre tenants dá uma terceira frente de fato (segurança).

### 2026-09-09 — M5 — G5 UX/mobile (admin) — PASS
- [visual, browser real, API sem banco] `/admin/catalog`, `/admin/catalog/products`: navegação por abas renderiza, estado de erro estruturado aparece corretamente (`Rota não encontrada: GET /v1/me/tenants` — API de teste sem `DATABASE_URL`, por design, mesma limitação documentada desde o M4/ADR-028), sem crash de render em nenhuma aba.
- **Limitação real registrada, não escondida:** sem Postgres local (ENV-1), não foi possível testar visualmente o fluxo completo de criar estação → categoria → produto na tela real (só via CI, que tem Postgres real). Os 4 estados obrigatórios (loading/vazio/erro/sucesso) foram implementados e revisados no código para os três, mas só o estado de erro foi confirmado ao vivo num browser real neste milestone.

### 2026-09-09 — M5 — `pnpm check` + build do monorepo — PASS
`pnpm check` e `pnpm build` verdes no monorepo inteiro, incluindo as novas rotas de `apps/web` (`/admin/catalog`, `/admin/catalog/{stations,categories,products}`) geradas no build de produção.

---

## Milestone M6 — Mesas, QR e sessão de mesa (Fase B)

### 2026-09-09 — M6 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` (versão M6) escreveu o escopo antes de codar: `areas`/`tables`/`table_sessions`/`tabs`/`guests` com CRUD admin + abertura pública de sessão; `service_requests`/`table_session_transfers` fora (Fase C/M11). Gate de Plano respondido no próprio arquivo. Tratado como **crítico** (regra 2 do CLAUDE.md: sessão/tenant) — 3 frentes exigidas.

### 2026-09-09 — M6 — G2 Dados/contratos — PASS
- [schema] `packages/db/src/schema/tables.ts`: `areas`/`tables`/`table_sessions`/`tabs` com RLS por tenant normal (ADR-021). **`guests` sem RLS, de propósito** (ADR-031, estende ADR-025): resolver o cliente pelo token do cookie acontece antes de existir contexto de tenant conhecido — mesmo caso de `devices`.
- [migração] `drizzle-kit generate`/`check` limpos; migration `0005` inspecionada: índice único parcial `table_sessions_open_per_table_key` (`WHERE status <> 'closed'`) confirmado na SQL gerada.
- **Achado real durante a implementação (bug pego na revisão, antes da CI):** a primeira versão de `openTableSession` tentava capturar a violação do índice único parcial e continuar consultando dentro da MESMA transação — o Postgres aborta o restante de uma transação após qualquer violação de constraint até o `ROLLBACK`; qualquer comando seguinte falharia com "current transaction is aborted". Corrigido: tentar criar (`tryCreateSession`) e entrar numa sessão já aberta (`joinExistingSession`) são duas transações **separadas** — ver ADR-031.

### 2026-09-09 — M6 — G3/G6 Feature, permissão e segurança (crítico, 3 frentes) — PASS
Frentes (`apps/api/test/integration/tables.test.ts`, Postgres real na CI, `bella_app`):
1. **Positivo/negativo de permissão:** `owner` cria área e mesa (`tables.manage`, mesa recebe `qr_code` único gerado pelo servidor); `kitchen` (sem `tables.manage`) recebe 403.
2. **Isolamento entre tenants:** mesa criada no Bella não aparece na listagem do Demo, com um dono do Demo autenticado de verdade fazendo a consulta.
3. **Sessão de mesa pública, ponta a ponta real:** abrir sessão a partir do `qr_code` devolve cookie `HttpOnly`/`SameSite=Lax`; `GET /public/me/table-session` com esse cookie resolve de volta o mesmo `tableSessionId` — prova que o cookie de fato autentica, não só que "a rota respondeu 200".
4. **Manipular a URL não dá acesso indevido:** código inexistente → 404 (não vaza se o tenant existe); a mesma mesa do Bella sob o slug do Demo → 404 (mesa nunca resolvida fora do tenant dono).
5. **Concorrência real (não simulada/sequencial):** duas requisições de abertura de sessão disparadas com `Promise.all` na mesma mesa — as duas retornam 200, ambas apontam para o MESMO `tableSessionId`, cada uma gera um `guest`/token diferente, e uma consulta independente ao banco confirma **exatamente uma** linha em `table_sessions` para aquela mesa (não duas em disputa, não um erro para a segunda).
- **Total: 8 testes novos** em `tables.test.ts` (admin: 3; sessão pública: 5, incluindo o de concorrência).

### 2026-09-09 — M6 — Escopo cortado: geração de PDF dos QR Codes — adiado, registrado
`ACTIVE_PLAN.md` prevê PDF dos QR Codes para o Victor imprimir. Decisão: a URL da mesa (`/{tenant}/m/{qrCode}`) já aparece na tela de admin de mesas, copiável manualmente — suficiente para destravar M7 (cardápio do cliente) e para o Bella III operar com poucas mesas no piloto. Geração de PDF em lote (biblioteca a pesquisar: candidatas `pdf-lib` + alguma lib de QR) fica para um milestone/tarefa dedicada, quando o número de mesas justificar não copiar uma por uma.

### 2026-09-09 — M6 — `pnpm check` + build do monorepo — PASS
`pnpm check` e `pnpm build` verdes no monorepo inteiro, incluindo as novas rotas de `apps/web` (`/admin/tables`, `/admin/tables/areas`) geradas no build de produção. **Limitação registrada:** sem Postgres local (ENV-1), a UI de mesas não foi testada visualmente ao vivo neste milestone (só via build + CI) — mesma limitação já documentada desde o M4.

### 2026-09-09 — M6 — Gate Git — PASS
PR #9 (`claude/m6-tables` → `main`), CI remota verde nos 3 jobs (60/60 testes de integração), merge commit `e323755`. Execução hands-off a partir daqui (pedido do Victor): merge após CI verde não espera mais confirmação.

---

## Milestone M7 — Cardápio do cliente + carrinho (fim da Fase B)

### 2026-09-10 — M7 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` (versão M7) registrou dois cortes de escopo antes de codar: SSE/realtime (`catalog.updated` ao vivo, é infraestrutura do M9) e modificadores na tela do cliente (M5 não tem UI de modificador nem no admin ainda). Gate de Plano respondido no próprio arquivo.

### 2026-09-10 — M7 — G2/G3 Dados e feature — PASS
- [schema/API] `GET /public/:tenantSlug/catalog` (novo, `apps/api/src/modules/catalog/service.ts`/`routes.ts`): só categoria ativa + produto ativo E disponível; roda dentro de `withTenant()` normalmente (tenant resolvido pelo slug, não é caso de exceção de RLS). Helper `resolveTenantBySlug` extraído para `apps/api/src/lib/tenant-slug.ts` e reaproveitado do M6 (`tables/service.ts`), evitando duplicar a mesma lógica de resolução de tenant por slug em dois módulos.
- [integração — Postgres real, CI] `public-catalog.test.ts` (3 testes): produto ativo+disponível aparece; produto esgotado (`isAvailable=false`) e produto desativado (`isActive=false`) nunca aparecem, mesmo criados no mesmo tenant/categoria; produto de outro tenant nunca aparece na resposta; slug inexistente devolve 404.
- [frontend] `apps/web/src/lib/cart.ts`: carrinho Zustand + `persist` (`zustand@5.0.15`, versão confirmada via npm antes de instalar — regra 12), um store por `tableSessionId` (cacheado em módulo, nunca recriado a cada render); `Idempotency-Key` gerada ao montar o carrinho (primeiro item), nunca enviada neste milestone (não existe envio de pedido ainda). `apps/web/src/components/customer/customer-menu.tsx`: abre a sessão de mesa (M6) e busca o catálogo público ao carregar; categorias/produtos agrupados e ordenados por `sortOrder`; botão de adicionar vira contador +/- quando o item já está no carrinho; CTA fixo no rodapé com contagem e total (só prévia — servidor recalcula tudo no M8).
- [E2E manual real, browser] Testado com um servidor Node mínimo simulando as duas rotas públicas (mesmo padrão do M4/M5 para telas sem Postgres local disponível, ENV-1): sessão abre, cardápio carrega agrupado por categoria, adicionar item atualiza o contador E o CTA do rodapé em tempo real, total calculado corretamente (24,90 + 54,90 = 79,80, conferido), **carrinho sobrevive a um reload completo da página** (prova real de que o `persist` do Zustand está gravando/lendo o localStorage, não só "parece que sim"). Testado em mobile (375px) e desktop.

### 2026-09-10 — M7 — `pnpm check` + build do monorepo — PASS
`pnpm check` e `pnpm build` verdes no monorepo inteiro, incluindo a rota dinâmica `/{tenant}/m/{table}` (antes placeholder do M4, agora com conteúdo real) gerada no build de produção.

### 2026-09-10 — M7 — Gate Git — PASS
PR #11 (`claude/m7-customer-menu` → `main`), CI remota verde nos 3 jobs (63/63 testes), merge commit `b5a35dd`. **Fase B completa.**

---

## Milestone M8 — Criação idempotente de pedido (Fase C, CRÍTICO)

### 2026-09-10 — M8 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` (versão M8) registrou o escopo antes de codar: sem modificador no item (carrinho do M7 não tem), sem KDS (M9 lê os tickets criados aqui), sem pagamento (Fase D). Tratado como **crítico** (regra 2: dinheiro/comanda) — 3 frentes exigidas. Gate de Plano respondido no próprio arquivo.

### 2026-09-10 — M8 — G2 Dados/contratos — PASS
- [schema] `packages/db/src/schema/orders.ts`: `orders`/`order_items`/`production_tickets`/`order_events`/`ledger_entries` (só `item_charge` neste milestone), todas com RLS normal (ADR-021). Migration `0006` limpa (`drizzle-kit check`).
- **Achado real de reaproveitamento:** `idempotency_keys` e `domain_events` já existiam desde o M1 (criadas na fundação, nunca usadas) — nenhuma migration nova foi necessária para elas, só o código que finalmente as usa.
- **Decisão de arquitetura registrada (ADR-032):** idempotência real via `INSERT ... ON CONFLICT DO NOTHING` na MESMA transação (diferente do padrão do M6/ADR-031, que exigia duas transações separadas — aqui não há exceção que aborte a transação, então dá para continuar). `apps/api/src/lib/idempotency.ts` (`withIdempotency`) é reaproveitável por qualquer mutação crítica futura.

### 2026-09-10 — M8 — G3/G7 Feature e dinheiro/comanda (CRÍTICO, 3 frentes) — PASS
Frentes (`apps/api/test/integration/orders.test.ts`, Postgres real na CI, `bella_app`):
1. **Fluxo feliz + dinheiro:** cliente (via cookie de sessão de mesa, M6) cria pedido; preço do item vem do servidor (nunca do corpo — o schema Zod nem aceita um campo de preço do cliente); total da API bate com `SUM(line_total_cents)` consultado independentemente; ledger (`item_charge`) gravado com o valor certo; ticket de produção roteado para a estação certa do produto.
2. **Tudo ou nada:** produto esgotado no momento do pedido → `422 ITEM_UNAVAILABLE`; consulta independente confirma que NEM o pedido NEM a chave de idempotência ficaram gravados (o rollback desfaz os dois juntos).
3. **Idempotência real, 3 casos:** (a) mesma chave + mesmo corpo 2x → mesmo `order.id` nas duas respostas, e só 1 linha em `orders` para aquela chave; (b) mesma chave + corpo diferente → `409 IDEMPOTENCY_MISMATCH`; (c) **concorrência real** (`Promise.all`, não sequencial) com a mesma chave → nunca duas linhas de pedido para a mesma chave, confirmado por consulta independente ao banco (uma das duas respostas pode legitimamente ser 409 "em andamento" se a janela de tempo for exata, mas nunca dois pedidos diferentes).
- **Total: 5 testes novos** em `orders.test.ts`.

### 2026-09-10 — M8 — Escopo cortado: `sequence_number` simplificado — registrado
`DOMAIN_MODEL.md §1.5` pede um número por dia operacional (`tenant_settings.business_day_cutoff`). Implementado como `COUNT(*) + 1` por tenant (sem reset diário, sem garantia de unicidade sob concorrência extrema) — cosmético, não afeta dinheiro nem isolamento (`orders.id` é a chave real). Corrigir quando um relatório diário de verdade precisar disso (Fase D). Ver ADR-032.

### 2026-09-10 — M8 — `pnpm check` + build do monorepo — PASS
`pnpm check` e `pnpm build` verdes no monorepo inteiro.

### 2026-09-10 — M8 — Gate Git — PASS
PR #13 (`claude/m8-orders` → `main`), CI remota verde nos 3 jobs (68/68 testes), merge commit `123537a`.

---

## Milestone M9 — KDS em tempo real (Fase C)

### 2026-09-10 — M9 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` (versão M9) registrou o escopo antes de codar: SSE mínimo viável (canal único `orders`, polling do outbox em vez de LISTEN/NOTIFY), sem alerta de cancelamento (M11 não existe ainda), atribuição de estação ao KDS só na hora do pareamento (reatribuição fica para depois). Gate de Plano respondido no próprio arquivo.

### 2026-09-10 — M9 — G2/G3 Dados e feature — PASS
- [schema] `pairing_codes.station_ids` (nova coluna, migration `0007`), propagada para `devices.station_ids` na troca do código — campo que já existia desde o M3, nunca preenchido até agora.
- [API] `GET /v1/stream` (SSE), `GET /v1/kds/tickets`, `POST /v1/kds/tickets/:id/{start,ready,recall}` — todos autenticados por dispositivo (`X-Device-Token`, M3), nunca sessão de staff.
- **Decisão de arquitetura registrada (ADR-033):** SSE via polling do outbox (não LISTEN/NOTIFY); token de dispositivo aceito por `?deviceToken=` só para o `EventSource` (que não permite headers customizados); bump de ticket via `UPDATE ... WHERE status = $antigo` (não `SELECT`+`UPDATE` separados) para a corrida entre dois KDS ser resolvida pelo próprio Postgres.
- **Achado real de teste (pesquisa antes de codar, regra 12):** `fastify.inject()` não serve para testar um SSE de verdade (a injeção só devolve depois que a resposta termina, e um stream nunca termina sozinho) — `realtime.test.ts` sobe o servidor de verdade (`app.listen()`) e lê com `fetch` real, abortando a conexão depois de confirmar o evento.

### 2026-09-10 — M9 — G4/G8 Integração cliente→cozinha e KDS — PASS
Frentes (`apps/api/test/integration/{kds,realtime}.test.ts`, Postgres real na CI):
- KDS só vê tickets das próprias estações (dispositivo pareado para uma estação inexistente não vê o ticket real).
- Transição inválida (`ready` antes de `start`) → `409 INVALID_TRANSITION`; sequência válida (`start` → `ready`) funciona e reflete no corpo devolvido.
- **Bump idempotente:** chamar `/start` duas vezes no mesmo ticket devolve 200 as duas vezes, sem erro — mesmo comportamento exigido pelo `DOMAIN_MODEL.md §2.6` para dois KDS bumpando quase ao mesmo tempo.
- Dispositivo de outra estação não consegue transicionar um ticket que não é dele → `403`.
- **SSE real:** conexão aberta ANTES do pedido ser criado recebe o evento `order.created` pelo stream (não é replay inicial) — provado lendo a resposta com `fetch` real contra um servidor `listen()` de verdade, não `fastify.inject()`.
- **Total: 9 testes novos** (5 em `kds.test.ts`, 1 em `realtime.test.ts` + reaproveitamento do fluxo de pedido do M8 dentro dos próprios testes).

### 2026-09-10 — M9 — G5 UX (KDS) — PASS
- [visual, browser real] `/kds`: tela de pareamento renderiza (fonte grande, botão de alvo de toque generoso); após simular um token salvo, transiciona para o quadro de tickets e mostra o estado de erro corretamente quando a API não responde (sem crash de render). `/admin/devices`: formulário de seleção de estação + geração de código renderiza.
- **Limitação real registrada:** sem Postgres local (ENV-1), não foi possível testar visualmente o fluxo completo (pareamento real → ticket aparecendo → bump) numa tela real — só via CI (Postgres real) e inspeção de código/estados de erro no browser.

### 2026-09-10 — M9 — `pnpm check` + build do monorepo — PASS
`pnpm check` e `pnpm build` verdes no monorepo inteiro, incluindo `/kds` (conteúdo real, antes placeholder do M4) e `/admin/devices` (novo) no build de produção.

### 2026-09-10 — M9 — Gate Git — PASS
PR #15 (`claude/m9-kds-realtime` → `main`), CI remota verde nos 3 jobs (73/73 testes), merge commit `17d8f53`.

---

## Milestone M10 — Acompanhamento, expedição e chamados (Fase C)

### 2026-09-10 — M10 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` (versão M10) registrou dois cortes de escopo antes de codar, e um terceiro durante a execução: SSE dedicado ao cliente adiado (polling a cada 3s resolve o gate "muda em <3s" com muito menos complexidade); chamados e expedição numa tela só de staff. Gate de Plano respondido no próprio arquivo.

### 2026-09-10 — M10 — G2/G3 Dados e feature — PASS
- [schema] `service_requests` (migration `0008`), RLS normal.
- [API] `POST /public/:tenantSlug/service-requests`, `GET /v1/service-requests`, `PATCH /v1/service-requests/:id/{acknowledge,done}`; `PATCH /v1/orders/:id/{accept,reject}` (resolve a pendência do M8: sessão não verificada ficava `submitted` sem caminho de decisão); `GET /public/:tenantSlug/orders` (acompanhamento do cliente); `GET /v1/tickets/ready` (expedição, staff, todas as estações).
- **Achado real de produto (não hipotético, pego testando de verdade no browser):** o botão "Ver carrinho" do M7 nunca chamava a API de pedido do M8 — o ciclo cliente→pedido→cozinha só fechava tecnicamente por trás (via testes de API), nunca de fato pela UI do cliente. Corrigido: tela de carrinho real com botão "Enviar pedido" ligado à `Idempotency-Key` já gerada pelo carrinho (M7). Ver ADR-034.
- **Achado real de UI:** status de item (`order_items.status`) aparecia cru na tela do cliente ("queued") por o mapa de tradução só cobrir status de pedido, não de item — dois conjuntos de valores parecidos, mas diferentes. Corrigido.
- **Achado real de QA:** duas telas novas (`/admin/devices`, `/admin/service-requests`) ficavam em branco (sem loading/erro) quando o tenant não carregava — só apareceu testando com uma API que não respondia `/v1/me/tenants`, simulando o caso real de erro de rede. Corrigido nas duas (`FRONTEND_GUIDELINES.md §7`, 4 estados obrigatórios).

### 2026-09-10 — M10 — G3/G4 Feature e integração cliente→salão — PASS
Frentes (`apps/api/test/integration/{service-requests,kds}.test.ts`, Postgres real na CI):
- Cliente chama garçom → staff vê na lista de chamados abertos → atende → chamado some da lista.
- Marcar chamado como concluído duas vezes é idempotente (mesmo padrão do bump de ticket, M9).
- Chamado de um tenant não aparece na lista de outro.
- Pedido de cliente nasce `submitted`; `accept` muda para `accepted` e aparece assim no acompanhamento do próprio cliente; `reject` muda para `rejected`; aceitar um pedido já rejeitado não muda o estado (idempotente pelo estado atual — `UPDATE ... WHERE status='submitted'` não afeta nada, estado atual é devolvido).
- Cliente só vê os próprios pedidos (nunca de outra sessão de mesa).
- Ticket marcado `ready` pelo KDS aparece na expedição de qualquer staff (não só de quem tem aquela estação — expedição é visão tenant-wide de propósito).
- **Total: 8 testes novos** (7 em `service-requests.test.ts` + 1 em `kds.test.ts`).

### 2026-09-10 — M10 — G5 UX (cliente + staff) — PASS
- [E2E manual real, browser] Fluxo completo do cliente testado de ponta a ponta com um servidor Node simulando as rotas públicas (sem Postgres local, ENV-1): adicionar item → abrir carrinho → **enviar pedido de verdade** → tela de acompanhamento mostra "Pedido #1 · Aguardando confirmação · Na fila" → **chamar garçom confirma na tela** → status muda para "Confirmado" sozinho via polling, dentro de poucos segundos (prova real do requisito "<3s", não só lido no código). Testado em mobile (375px).
- [E2E manual real, browser] `/admin/service-requests` mostra estado de erro correto (antes ficava em branco) quando a API não responde.
- **Limitação real registrada:** sem Postgres local, o fluxo completo não foi testado com dados reais de ponta a ponta (cliente → staff aceita → KDS prepara → cliente vê "Pronto") — só via CI (Postgres real, por partes) + E2E manual com API simulada.

### 2026-09-10 — M10 — `pnpm check` + build do monorepo — PASS
`pnpm check` e `pnpm build` verdes no monorepo inteiro, incluindo `/admin/service-requests` (novo) no build de produção.

### 2026-09-10 — M10 — Gate Git — PASS
PR #17 (`claude/m10-tracking-calls` → `main`), CI remota verde nos 3 jobs (80/80 testes), merge commit `95103fe`.

---

## Milestone M11 — Cancelamentos e pedido pela equipe (fecha a Fase C)

### 2026-09-10 — M11 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` (versão M11) registrou o corte de escopo antes de codar: transferência/junção de mesa (`table_session_transfers`) fica fora deste milestone — problema à parte de verdade (concorrência própria), não bloqueia cancelamento nem pedido pela equipe. Tratado como **crítico** (regra 2: "cancelamento" listado explicitamente) — 3 frentes exigidas. Gate de Plano respondido no próprio arquivo.

### 2026-09-10 — M11 — G2 Dados/contratos — PASS
- [schema] `order_items` ganha `cancelled_at`/`cancel_reason`/`cancel_stage`/`charge_on_cancel` (migration `0009`, reservados desde o M8).
- [API] `PATCH /v1/orders/:orderId/items/:itemId/cancel` — permissão resolvida dinamicamente pelo `stage` do corpo (`orders.cancel.before_production` vs. `orders.cancel.after_production`, chaves diferentes), não um `requirePermission` fixo. `GET /v1/tabs/open` (novo, necessário para a tela de pedido pela equipe escolher onde lançar).

### 2026-09-10 — M11 — G3/G7 Feature e dinheiro/cancelamento (CRÍTICO, 3 frentes) — PASS
Frentes (`apps/api/test/integration/cancel-order.test.ts`, Postgres real na CI):
1. **Cancelar antes da produção**: reversão TOTAL sempre — saldo da comanda (soma do ledger) volta a 0, consultado independentemente. Cancelar duas vezes é idempotente — a segunda chamada NÃO gera um segundo `item_reversal` (dinheiro duplicado é o pior bug possível aqui; testado explicitamente, não só assumido).
2. **Cancelar depois da produção** (item avançado de verdade via KDS, `start`, antes do teste): `chargeOnCancel=true` → SEM reversão, saldo continua cobrado; `chargeOnCancel=false` → COM reversão, saldo volta a 0. Os dois casos testados separadamente, cada um com sua própria consulta independente ao ledger.
3. **Negativo/isolamento**: papel sem `orders.cancel.before_production` → 403 (positivo: `waiter`, que tem a permissão, funciona); item de outro tenant → 404, nunca vaza.
- **Total: 7 testes novos.**

### 2026-09-10 — M11 — G5 UX (staff) — PASS
- [visual, browser real] `/admin/staff-order` (novo): estado de erro correto sem API respondendo (mesmo padrão de loading/erro corrigido no M10).
- KDS (`/kds`): item cancelado ganha destaque visual (tachado, fundo vermelho suave, rótulo "CANCELADO"); SSE já escuta `item.cancelled` além de `order.created` para atualizar em tempo real.
- **Limitação real registrada:** sem Postgres local, o fluxo completo (staff cancela → KDS mostra alerta ao vivo) não foi testado com dados reais de ponta a ponta — só via CI (Postgres real, por partes).

### 2026-09-10 — M11 — `pnpm check` + build do monorepo — PASS
`pnpm check` e `pnpm build` verdes no monorepo inteiro, incluindo `/admin/staff-order` (novo) no build de produção.

### 2026-09-10 — M11 — Gate Git — PASS
PR #19 (`claude/m11-cancellations-staff-order` → `main`), CI remota verde nos 3 jobs (87/87 testes), merge commit `2a2ecaf`. **Fase C completa.** *(Registro retroativo — esta entrada tinha ficado faltando na sessão do M11; corrigida ao abrir o M12, `CLAUDE.md` regra "fonte de verdade documental".)*

---

## Milestone M12 — Ledger, taxas, couvert, descontos (abre a Fase D)

### 2026-09-10 — M12 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` (versão M12) respondeu o Gate de Plano no início da implementação: `totals.ts` puro reconstrói tudo a partir do ledger (não de `order_items`, evitando reimplementar a regra de cancelamento do M11); lock-in automático de taxa/couvert só na primeira consulta (nunca recalculado depois, conforme o plano original); desconto maior que o saldo é rejeitado, nunca limitado a zero em silêncio; `GET /bill` liberado a qualquer sessão de staff (`requireAnySession`) por não existir uma única chave de permissão que cubra cashier+waiter+manager+owner e por não ser uma ação sensível como desconto/pagamento. Tratado como **crítico** (regra 2: "dinheiro" e "comanda" listados explicitamente) — 3 frentes exigidas. Também registrada a confirmação do Victor sobre o modelo de pagamento do Bella III (Q6, `PRODUCT_CONTEXT.md`), que não muda o escopo do M12 mas remove a pendência antes do M13.

### 2026-09-10 — M12 — G2 Dados/contratos — PASS
- [schema] Nenhuma migration nova — `tenant_settings` (M1) e o `CHECK` de `ledger_entries.type` (M1) já cobriam `service_fee`/`couvert`/`discount` desde o início; M12 é só a primeira feature a usá-los de verdade.
- [contracts] `packages/contracts/src/billing.ts`: `applyDiscountSchema` (união discriminada `percentage`/`fixed`, `reason` obrigatório).
- [domain] `packages/domain/src/totals.ts`: `computeBillTotals` (fórmula pura do `DOMAIN_MODEL.md §4`), `computeServiceFeeCents` (reaproveita `applyBps`/`round_half_even`, nunca reimplementa), `computeCouvertCents` (3 modos).

### 2026-09-10 — M12 — G3/G7 Feature e dinheiro/ledger (CRÍTICO, 3 frentes) — PASS
Frentes:
1. **[unit]** `packages/domain/test/totals.test.ts` (12 testes): tabela de casos de centavos para `service_fee`/`couvert` (`off`/`per_guest`/`per_tab`, `guestCount` nulo tratado como 0), `grand_total`/`balance` incluindo o caso "reversão total zera itemsTotal", rejeição de entrada não-inteira.
2. **[integração, Postgres real, CI]** `apps/api/test/integration/billing.test.ts`: `GET /bill` trava a taxa de serviço (10% do seed) na primeira consulta e o total bate com uma soma independente do ledger (consulta direta, nunca via API); segunda consulta — e duas chamadas concorrentes reais via `Promise.all` — não duplicam o lançamento (confirmado contando linhas do ledger, não só comparando o total devolvido); desconto percentual materializa `ledger_entries` negativo e a taxa de serviço recalculada na consulta seguinte já usa o líquido pós-desconto.
3. **[negativo/isolamento]** desconto maior que o saldo de itens → 400, sem gravar nada no ledger; papel sem `discounts.apply` → 403 (positivo: `owner`, que tem a permissão); comanda de outro tenant → 404 tanto em `GET /bill` quanto em `POST /discounts`, nunca vaza.
- **Total: 8 testes de integração novos + 12 unitários novos.**

### 2026-09-10 — M12 — `pnpm lint`/`typecheck`/`test`/`build` — PASS
Todos verdes no monorepo inteiro (testes de integração exigem Postgres real — não disponível localmente, ENV-1 — rodam na CI). Sem migration para gerar/checar neste milestone.

### 2026-09-10 — M12 — Gate Git — PASS
PR #21 (`claude/m12-totals-ledger` → `main`), CI remota verde nos 3 jobs, merge commit `6fcb18e`.

### 2026-09-10 — M12 — Correção de documentação — PASS
`docs/DOMAIN_MODEL.md §1.6` previa uma tabela `discounts` própria que a implementação não criou (desconto materializa direto em `ledger_entries`, mesmo padrão do `item_reversal` do M11). Corrigido no próprio `DOMAIN_MODEL.md` com a razão registrada (CLAUDE.md, "fonte de verdade documental": divergência entre doc e código sempre investigada e corrigida na fonte desatualizada).

---

## Milestone M13 — Sessão de caixa e pagamentos

### 2026-09-10 — M13 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` (versão M13) respondeu o Gate de Plano no início da implementação: um `cash_register` por tenant, provisionado no seed (sem CRUD ainda, YAGNI); `cash_sessions` usa índice único parcial (mesmo padrão de `table_sessions_open_per_table_key`, M6) — só uma sessão aberta por registrador, garantido pelo banco; `payments.amountCents` nunca excede o saldo, verificado reaproveitando `computeBill` (núcleo do `getBill` do M12, extraído para rodar DENTRO da mesma transação) com o mesmo `FOR UPDATE` na `tab` que serializa concorrência (mesmo princípio do `createOrder`, M8); troco só existe em dinheiro (`refine` no contrato); `POST /payments` exige `Idempotency-Key` (primeira mutação de dinheiro ENTRANDO no sistema); `POST /payments/:id/void` idempotente por construção (mesmo padrão do `cancelOrderItem`, M11). Fechamento de sessão com contagem/divergência e `cash_movements` (sangria/suprimento) explicitamente adiados para o M14. Tratado como **crítico** (regra 2: "dinheiro" listado explicitamente) — 3 frentes exigidas.

### 2026-09-10 — M13 — G2 Dados/contratos — PASS
- [schema] `packages/db/src/schema/billing.ts` (novo arquivo): `cashRegisters`, `cashSessions` (índice único parcial `cash_sessions_open_per_register_key`), `payments`. Migration `0010_glossy_hulk.sql`, verificada limpa via `drizzle-kit check`. Seed provisiona um "Caixa único" por tenant (idempotente, `onConflictDoNothing`).
- [contracts] `packages/contracts/src/payments.ts`: `openCashSessionSchema`, `createPaymentSchema` (3 `refine` encadeados para a regra "troco só em dinheiro" — cobertos por 6 testes unitários próprios), `voidPaymentSchema`.
- [API] `POST /v1/cash-sessions/open` (`cash.open`), `GET /v1/cash-sessions/current` (qualquer staff), `POST /v1/tabs/:id/payments` (`payments.record`, `Idempotency-Key` obrigatória), `POST /v1/payments/:id/void` (`payments.void`).

### 2026-09-10 — M13 — G3/G7 Feature e dinheiro/caixa (CRÍTICO, 3 frentes) — PASS
Frentes:
1. **[unit]** `packages/contracts/test/payments.test.ts` (6 testes): os 3 `refine` do contrato de pagamento (troco proibido fora de dinheiro, troco obrigatório em dinheiro, troco não pode ser menor que o valor cobrado) testados nos dois sentidos (aceita/rejeita).
2. **[integração, Postgres real, CI]** `apps/api/test/integration/payments.test.ts`: pagamento sem sessão de caixa aberta → `CASH_SESSION_CLOSED`; abrir sessão funciona e uma segunda sessão com a primeira aberta → 409 (índice único, não checagem em código); pagamento parcial em dinheiro reduz o saldo e calcula troco corretamente; estornar pagamento devolve o saldo e estornar duas vezes é idempotente (não duplica); duas requisições com a MESMA `Idempotency-Key` criam só um pagamento (concorrência real via `Promise.all`); **dois pagamentos concorrentes que juntos excedem o saldo — só um vence, o outro recebe `OVERPAYMENT`** (prova real de que o `FOR UPDATE` serializa, não só lido no código); pagamento maior que o saldo isolado também rejeitado, nada gravado no ledger.
3. **[negativo/isolamento]** sem `payments.record` → 403; sem `payments.void` → 403; comanda de outro tenant → 404, nunca vaza (mesmo com o tenant de destino tendo sua própria sessão de caixa aberta, para não confundir os códigos de erro).
- **Total: 11 testes de integração novos + 6 unitários novos.**

### 2026-09-10 — M13 — `pnpm lint`/`typecheck`/`test`/`build` — PASS
Todos verdes no monorepo inteiro (testes de integração exigem Postgres real — não disponível localmente, ENV-1 — rodam na CI). Migration `0010_glossy_hulk.sql` gerada e verificada (`drizzle-kit check`).

### 2026-09-10 — M13 — Regressão pega pela CI (regra 3 do CLAUDE.md) — corrigida
Primeira rodada de CI: 1 dos 104 testes de integração falhou (`pagamento maior que o saldo → 409 OVERPAYMENT`). Diagnóstico: o teste assumia saldo `11000` (itens + taxa de serviço já travada) numa comanda onde a PRIMEIRA ação era o próprio pagamento rejeitado — mas o lock-in automático da taxa (feito por `computeBill` dentro da mesma transação do pagamento) é revertido junto com o resto quando `OVERPAYMENT` é lançado (uma transação rejeitada não deixa nenhum efeito colateral, nem os que ela mesma tentou criar). Não era bug de produção — era o teste assumindo um saldo que nunca tinha sido de fato commitado. Corrigido: o teste agora chama `GET /bill` primeiro (estabelece e commita o saldo real de `11000`), só then tenta o pagamento que excede e confirma que nada muda. Retestado — verde.

### 2026-09-10 — M13 — Gate Git — PASS
PR #22 (`claude/m13-cash-payments` → `main`), CI remota verde nos 3 jobs na segunda rodada (1 regressão real de teste corrigida antes do merge, ver acima), merge commit `0c600fe`.

---

## Milestone M14 — Fechamento de caixa e relatórios

### 2026-09-10 — M14 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` (versão M14) respondeu o Gate de Plano no início da implementação: `cashMovements`/`cashDivergences` no mesmo `packages/db/src/schema/billing.ts` do M13; `adjustment` reservado no `CHECK` de `cash_movements.type` mas sem endpoint (YAGNI, sem caso de uso real); `expected` por forma de pagamento sempre derivado de `payments`+`cashMovements` sob demanda, nunca uma coluna JSONB cacheada; `close` idempotente por RECONSTRUÇÃO (payments/movements são imutáveis depois que a sessão fecha, então recalcular dá sempre a mesma resposta — uma segunda chamada só não insere `cashDivergences` de novo); divergência sempre gravada quando `counted ≠ expected`, inclusive forma que o operador esqueceu de contar (vira 0, gera divergência visível, nunca é escondida). Tratado como **crítico** (regra 2: "dinheiro" listado explicitamente) — 3 frentes exigidas.

### 2026-09-10 — M14 — Correção de documentação — PASS
`docs/DOMAIN_MODEL.md §1.6` tinha três divergências da implementação real, corrigidas com a razão registrada (regra "fonte de verdade documental"): `cash_movements.type` não tem mais `sale` (vendas já estão em `payments`, decisão já tomada no Gate de Plano do M13 #8 e só agora refletida no documento); `cash_sessions` não tem colunas `expected`/`counted` JSONB (sempre recalculável, uma coluna cache seria redundante); `blind_close` não foi implementado (sem tela que use, YAGNI — fácil de adicionar depois).

### 2026-09-10 — M14 — G2 Dados/contratos — PASS
- [schema] `cashMovements`, `cashDivergences` (mesmo arquivo `billing.ts` do M13). Migration `0011_flowery_white_queen.sql`, verificada limpa via `drizzle-kit check`.
- [contracts] `packages/contracts/src/payments.ts` ganhou `cashMovementSchema` (`withdrawal`/`deposit`) e `closeCashSessionSchema` (`counted` por forma de pagamento).
- [API] `POST /v1/cash-sessions/:id/movements` (`cash.movement`), `POST /v1/cash-sessions/:id/close` (`cash.close`).

### 2026-09-10 — M14 — G3/G7 Feature e dinheiro/caixa (CRÍTICO, 3 frentes) — PASS
Frentes (`apps/api/test/integration/cash-close.test.ts`, Postgres real na CI; usa o tenant `demo` de propósito — `payments.test.ts` do M13 abre uma sessão no registrador do `bella` e nunca fecha, então `demo` evita disputar o índice único "uma sessão aberta por registrador" entre arquivos de teste):
1. **Fechamento sem divergência**: contado bate o esperado em duas formas (`cash` só com o fundo de troco, `debit` com a venda) → nenhuma `cash_divergences` gravada; fechar de novo é idempotente (mesmo resumo, sem duplicar); sessão fechada rejeita pagamento novo (`CASH_SESSION_CLOSED`) e movimento novo (`CASH_SESSION_CLOSED`).
2. **Fechamento com sangria e divergência**: sangria (`withdrawal`) entra corretamente no `expected` (venda − sangria); contado errado gera `cash_divergences` com a diferença exata, confirmada por consulta independente ao banco (nunca só pelo corpo da resposta); fechar de novo não duplica a divergência já gravada.
3. **Negativo/isolamento**: sem `cash.close`/`cash.movement` → 403; sessão de caixa de outro tenant → 404 tanto em `close` quanto em `movements`, nunca vaza.
- **Total: 5 testes de integração novos.**

### 2026-09-10 — M14 — `pnpm lint`/`typecheck`/`test`/`build` — PASS
Todos verdes no monorepo inteiro (testes de integração exigem Postgres real — não disponível localmente, ENV-1 — rodam na CI). Migration `0011_flowery_white_queen.sql` gerada e verificada (`drizzle-kit check`). Um erro de tipo real pego pelo próprio `tsc` antes de qualquer commit (`Map<string,PaymentMethod>` inferido onde precisava de `Map<string,string>`) — corrigido com tipagem explícita.

### 2026-09-10 — M14 — Regressão pega pela CI (regra 3 do CLAUDE.md) — corrigida
Primeira rodada de CI: os 4 testes de `cash-close.test.ts` falharam. Diagnóstico: `payments.test.ts` (M13) abre — de propósito, para testar isolamento cross-tenant — uma sessão de caixa no registrador único do tenant `demo` e nunca fecha; como `fileParallelism: false` roda os arquivos em sequência (não é corrida de verdade), `cash-close.test.ts` (que também usa `demo`, escolhido justamente para não disputar o registrador do `bella`) encontrou o registrador do `demo` já ocupado por esse leftover do M13. Não era bug de produção — o índice único fez exatamente o que devia (`CONFLICT` numa segunda abertura). Corrigido: `beforeAll` de `cash-close.test.ts` agora fecha qualquer sessão aberta do `demo` direto no banco antes do primeiro teste, tornando o arquivo resiliente à ordem de execução entre arquivos, não só ao paralelismo. Retestado — verde.

### 2026-09-10 — M14 — Gate Git — PASS
PR #23 (`claude/m14-cash-close` → `main`), CI remota verde nos 3 jobs na segunda rodada (1 regressão real de teste — ordem entre arquivos, não paralelismo — corrigida antes do merge, ver acima), merge commit `ba7c790`.

---

## Milestone M15 — Divisão de conta e Golden Journey completa (fecha a Fase D)

### 2026-09-10 — M15 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` (versão M15) respondeu o Gate de Plano no início da implementação: `tab_closures` com `tab_id` único (nunca duas fotografias); `POST /close` idempotente por construção (já `closed` devolve a fotografia existente); rejeita fechar com saldo pendente (`CONFLICT`, 409 — pior erro possível aqui); permissão nova `tabs.close` (primeira chave nova desde o M2 — nenhuma existente cobria semanticamente "fechar comanda"), concedida a owner/manager/cashier; `GET /split` divide o SALDO restante (não o total original, para continuar útil com pagamento parcial já feito), puramente informativo, nunca grava nada; Golden Journey usa `bella` com a mesma defesa contra estado residual do M14. Tratado como **crítico** (regra 2: "comanda" e "dinheiro" listados explicitamente) — 3 frentes exigidas.

### 2026-09-10 — M15 — G2 Dados/contratos — PASS
- [schema] `tabClosures` (mesmo arquivo `billing.ts`), índice único em `tab_id`. Migration `0012_organic_felicia_hardy.sql`, verificada limpa via `drizzle-kit check`.
- [domain] Permissão nova `tabs.close` em `packages/domain/src/permissions.ts`, concedida a `owner` (automático, lista completa), `manager` (automático) e `cashier` (adicionada explicitamente).
- [contracts] `packages/contracts/src/billing.ts` ganhou `tabSplitQuerySchema` (`z.coerce` para query string).
- [API] `POST /v1/tabs/:id/close` (`tabs.close`), `GET /v1/tabs/:id/split?parts=N` (qualquer staff).

### 2026-09-10 — M15 — G3/G7 Feature e dinheiro/comanda (CRÍTICO, 3 frentes) — PASS
Frentes:
1. **[integração, Postgres real, CI]** `apps/api/test/integration/tab-close.test.ts` (7 testes): fechar com saldo 0 grava `tab_closures` e muda `tabs.status`; fechar de novo é idempotente (não duplica a fotografia — contado via consulta independente); fechar com saldo pendente → 409 `CONFLICT`, nada gravado; sem `tabs.close` → 403; `GET /split` divide o saldo em N partes cuja soma bate exatamente com o saldo (propriedade, mesmo espírito dos testes de `splitEvenly` do M0).
2. **[integração, Golden Journey]** `apps/api/test/integration/golden-journey.test.ts`: um único teste percorrendo TODO o ciclo numa mesma comanda — cliente escaneia QR → monta e envia pedido (duplo-clique com a mesma `Idempotency-Key` prova UM pedido só, `order_items` também conferido direto no banco) → cozinha pareia um KDS real, inicia e finaliza o preparo (ticket de verdade, não simulado) → cliente acompanha (item aparece `ready`) e pede a conta → equipe vê o chamado, consulta o total (trava a taxa de serviço), aplica desconto → total recalculado bate exatamente → caixa abre sessão, cobra o valor exato, fecha a comanda → comanda fechada rejeita pedido novo → caixa fecha o turno sem divergência → **ledger inteiro soma exatamente 0** (consulta independente, prova final de que nada ficou "perdido, duplicado ou com conta errada" — o critério de sucesso do próprio `CLAUDE.md §Missão`).
3. **[negativo]** fechar comanda sem `tabs.close` → 403 (coberto em `tab-close.test.ts`); demais negativos/isolamento (permissão, cross-tenant) já cobertos exaustivamente pelos módulos individuais em M8–M14, não repetidos aqui de propósito — o Golden Journey testa a COSTURA entre módulos, não cada regra de novo.
- **Total: 8 testes de integração novos** (7 em `tab-close.test.ts` + 1 Golden Journey).

### 2026-09-10 — M15 — `pnpm lint`/`typecheck`/`test`/`build` — PASS
Todos verdes no monorepo inteiro (testes de integração exigem Postgres real — não disponível localmente, ENV-1 — rodam na CI). Migration `0012_organic_felicia_hardy.sql` gerada e verificada (`drizzle-kit check`).

### 2026-09-10 — M15 — Gate Git — PASS
PR #24 (`claude/m15-tab-close-golden-journey` → `main`), CI remota verde nos 3 jobs de primeira (sem regressão desta vez), merge commit `990dc83`.

### 2026-09-10 — Fase D — Gate de saída — PASS (com lacuna registrada)
"Totais reconstruíveis; permissões e concorrência testadas; fechamento sem conta manual" (`ROADMAP.md`) — todos atendidos e provados (M12–M15). **Lacuna real registrada, não esquecida:** o `ROADMAP.md` original previa "relatório do dia operacional" dentro do M14; não foi implementado — ver `KNOWN_ISSUES.md` R-16. Não bloqueia a Fase D (o gate de saída formal não exige relatórios), mas fica pendente antes de prometer isso ao Victor.

---

## Fase E (início) — M16 — Relatório do dia operacional

### 2026-09-10 — M16 — Confirmação do Victor
Q7 (`PRODUCT_CONTEXT.md §2`): cozinha por enquanto é só tela, sem impressora térmica. M16 "Impressão" do `ROADMAP.md` fica sem data; slot reaproveitado para o relatório do dia (fecha R-16). Victor também confirmou a ordem da Fase E: relatório do dia → backup/restore → resiliência de conexão.

### 2026-09-10 — M16 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` respondeu o Gate de Plano: sem tabela/migration nova (só consulta); `from`/`to` explícitos no query string em vez de calcular "dia operacional" automaticamente (matemática de timezone sem biblioteca testada seria risco real num relatório financeiro — decisão consciente, revisitar quando existir tela real); faturamento replica exatamente a regra de `items_total` do `computeBill` (M12); permissão `reports.view` já existia desde o M2; agrupamento por operador feito em JS sobre `jsonb`, não em SQL. Tratado como **normal** (2 frentes) — é leitura, não mutação de dinheiro.

### 2026-09-10 — M16 — G2/G3 Dados e feature — PASS
- [contracts] `packages/contracts/src/reports.ts`: `dailyReportQuerySchema` (`z.iso.datetime()` + `refine` `from < to`). 3 testes unitários.
- [API] `GET /v1/reports/daily?from=&to=` (`reports.view`): faturamento, ticket médio, mais vendidos (top 10 por receita), cancelamentos por operador (valor só conta se o item foi de fato revertido — `chargeOnCancel !== true`), descontos por operador. Nomes resolvidos via `users` (tabela global, sem RLS).
- [integração, Postgres real, CI] `apps/api/test/integration/reports.test.ts` (2 testes): comanda com item cancelado antes da produção (sempre revertido) não conta no faturamento, item que ficaria fora do intervalo não aparece, desconto e cancelamento aparecem agrupados no operador certo com o valor exato, ticket médio bate com o cálculo manual; sem `reports.view` → 403.
- **Total: 2 testes de integração novos + 3 unitários novos.**

### 2026-09-10 — M16 — `pnpm lint`/`typecheck`/`test`/`build` — PASS
Todos verdes no monorepo inteiro. Sem migration (nenhuma tabela nova).

### 2026-09-10 — M16 — Regressão pega pela CI (regra 3 do CLAUDE.md) — corrigida
Primeira rodada de CI: o teste de faturamento esperava `3000` e recebeu `190600`. Diagnóstico: a janela usada era "últimos 60s até próximos 60s" — mas a suíte de integração inteira roda em menos de um minuto, e o tenant `bella` é reaproveitado por vários arquivos de teste (`payments.test.ts`, `golden-journey.test.ts`, `tab-close.test.ts`, ...); a janela larga capturou pedidos de OUTROS arquivos que rodaram segundos antes, não só do próprio teste. Não era bug de produção — a consulta fez exatamente o que devia com o intervalo que recebeu. Corrigido: `from`/`to` agora são capturados imediatamente antes/depois das próprias ações do teste (janela mínima, não "últimos N segundos"). Retestado — verde.

### 2026-09-10 — M16 — Gate Git — PASS
PR #25 (`claude/m16-daily-report` → `main`), CI remota verde nos 3 jobs na segunda rodada (1 regressão real de teste — janela de tempo larga demais, não bug de produção — corrigida antes do merge, ver acima), merge commit `5342e84`.

---

## M18 — Backup/restore testado + runbook de incidentes

### 2026-09-10 — M18 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` respondeu o Gate de Plano no início da implementação: `pg_dump -Fc --no-owner --no-privileges` / `pg_restore --clean --if-exists`; prova real na CI (segundo banco Postgres, restaura o dump nele, compara `count(*)` de `tenants`/`memberships` entre origem e destino — só passa se bater); `postgresql-client-16` instalado explicitamente no job (nunca confiar no cliente padrão do runner); scripts em bash simples, sem camada TypeScript desnecessária; `docs/RUNBOOK_INCIDENTS.md` novo, separado do `RUNBOOK_DEV.md`; backups locais nunca commitados (`.gitignore`).

### 2026-09-10 — M18 — G2/G9 Dados/observabilidade e recuperação — PASS
- `packages/db/scripts/backup.sh` / `restore.sh` (executáveis, `chmod +x`), `pnpm db:backup` / `pnpm db:restore`.
- **Job novo `backup-restore` em `.github/workflows/ci.yml`**: semeia o banco, tira backup, cria um segundo banco Postgres do zero, restaura o dump nele, compara contagens de `tenants` e `memberships` entre original e restaurado — falha explicitamente se divergir. Não é um teste de "os comandos rodaram sem erro"; é uma prova de que a restauração devolve os dados certos.
- `docs/RUNBOOK_INCIDENTS.md`: API fora do ar, Postgres inacessível, restaurar de um backup (com os MESMOS comandos que a CI prova que funcionam), divergência de caixa/dado financeiro suspeito (nunca editar `ledger_entries` diretamente — append-only).
- `.gitignore`: `packages/db/backups/` nunca commitado.

### 2026-09-10 — M18 — `pnpm lint`/`typecheck`/`test`/`build` — PASS
Todos verdes no monorepo inteiro. Prova de backup/restore em si só roda na CI (exige um segundo banco Postgres real — não disponível localmente, ENV-1).

### 2026-09-10 — M18 — Gate Git — PASS
PR #26 (`claude/m18-backup-restore` → `main`), CI remota verde nos 4 jobs de primeira (incluindo o job novo `backup-restore` — sem regressão desta vez), merge commit `1cf638e`.

---

## M20 — Degradação/reconexão endurecida

### 2026-09-10 — M20 — Investigação prévia — PASS
Um agente auditou o que já existe antes do Gate de Plano (evitar redesenhar): SSE + `Last-Event-ID` + replay via `seq` já funcionavam desde o M9, mas nunca testado o ciclo desconectar→reconectar de verdade; heartbeat existia como COMENTÁRIO SSE, invisível ao `EventSource` do browser (achado real); nenhum banner "sem conexão"; nenhum retry em `apiFetch`; `ARCHITECTURE.md` descrevia canais múltiplos (`station`/`table-session`/`admin`) nunca implementados (só existe `orders`).

### 2026-09-10 — M20 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` respondeu o Gate de Plano: heartbeat vira evento nomeado (não comentário); watchdog de 30s no cliente reseta em qualquer evento; `onerror` reage na hora, sem esperar os 30s; teste de reconexão usa `AbortController` para fechar a conexão de propósito; retry só em `apiFetch`/`GET` (nunca em mutações, que já têm `Idempotency-Key`; nunca em `authFetch`); `ARCHITECTURE.md` corrigido para descrever o canal único que existe de verdade.

### 2026-09-10 — M20 — G2/G3/G8 Dados/feature/realtime — PASS
- [API] `apps/api/src/modules/realtime/routes.ts`: heartbeat agora `event: heartbeat\ndata: {}\n\n`.
- [web] `apps/web/.../kds/page.tsx`: watchdog de conexão (reseta em `heartbeat`/`order.created`/`item.cancelled`/`onopen`), `onerror` mostra banner na hora, banner calmo sem spinner (`ConnectionBanner`) presente em todos os 4 estados da tela (loading/erro/vazio/lista — `FRONTEND_GUIDELINES.md §7`).
- [web] `apps/web/src/lib/api.ts`: `apiFetch` ganha retry com backoff (2 tentativas) só para falha de rede em `GET`; `authFetch` inalterado.
- [docs] `ARCHITECTURE.md` corrigido em dois pontos (tabela de escolhas + §8): canal único `orders` documentado como o que existe hoje; canais múltiplos e banner/heartbeat marcados como implementados agora ou desenho futuro, sem prometer o que não existe.

### 2026-09-10 — M20 — G9 Observabilidade/recuperação (normal, 2 frentes) — PASS
Frentes:
1. **[integração, Postgres real, CI]** `apps/api/test/integration/realtime.test.ts`, novo teste de reconexão: conecta, recebe o evento do pedido A, **fecha a conexão de propósito com `AbortController`** (não só para de ler), cria o pedido B enquanto ninguém está conectado, reconecta com `Last-Event-ID` real, confirma que B chega e A NUNCA chega de novo (replay não perde nem duplica).
2. **[visual, browser real]** Servidor fake local (scratchpad, mesmo padrão do M9/M10) simulando o `/v1/stream`: banner "Sem conexão em tempo real — tentando reconectar" aparece na tela em ~1s depois de a conexão SSE ser derrubada de propósito, e some sozinho assim que a reconexão têm sucesso — confirmado por screenshot em cada momento, não só lido no código.
- **Total: 1 teste de integração novo** (o cenário mais valioso e antes não coberto: reconexão real).

### 2026-09-10 — M20 — `pnpm lint`/`typecheck`/`test`/`build` — PASS
Todos verdes no monorepo inteiro.

### 2026-09-10 — M20 — Gate Git — PASS
PR #27 (`claude/m20-reconnection-hardening` → `main`), CI remota verde nos 4 jobs de primeira, merge commit `52d39d2`. **Fecha a lista de prioridades que o Victor pediu para a Fase E (relatório → backup/restore → resiliência de conexão).**

---

## Handoff de design (Claude Design → produto) — M21 — Fundação do novo design system

### 2026-09-11 — M21 — Confirmação do Victor
Victor desenhou as 20 telas do produto num canvas do Claude Design e aprovou a direção — diferente da que estava em `FRONTEND_GUIDELINES.md`. Pediu handoff completo: implementar tudo, ele confere no final. Tokens extraídos do DOM real do mockup aprovado via `getComputedStyle` (cor, fonte, raio, sombra), não estimados visualmente.

### 2026-09-11 — M21 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` respondeu o Gate de Plano: tema claro vira padrão de `:root` (cliente+admin), tema escuro do KDS vira um tema PRÓPRIO fixo via classe `.kds-theme` (nunca "dark mode" alternável do usuário nem compartilhado com o resto do sistema); uma família tipográfica só (Switzer, remove Schibsted Grotesk e JetBrains Mono de `next/font/google`); `--brand` continua sendo o ponto de override white-label, só o valor default muda; cores semânticas recalibradas pro fundo claro; `FRONTEND_GUIDELINES.md` reescrito por completo, não remendado.

### 2026-09-11 — M21 — G5 UX (fundação, sem re-skin de tela ainda) — PASS
- `apps/web/src/app/globals.css`: tokens reescritos (hex/rgb extraídos do mockup, não oklch), `.kds-theme` como tema escuro fixo e isolado, `.font-mono-tabular` migrado pra pilha monoespaçada do sistema (sem depender de webfont).
- `apps/web/src/app/layout.tsx`: para de carregar Schibsted Grotesk/JetBrains Mono via `next/font/google` — só Switzer (Fontshare) continua.
- Classe utilitária `font-display` removida de todos os componentes que a usavam (8 arquivos) — não existe mais no `@theme inline`, ficaria quebrada silenciosamente se não fosse removida.
- **[visual, browser real]** `/admin/login`: fundo `#f2f2f2`, texto `#252525`, fonte Switzer, marca `#bd3027` confirmados via `getComputedStyle` — batem exatamente com o mockup. `/kds` e `/bella/m/TESTE`: sem quebra de layout, sem texto ilegível — ainda no visual "antigo" (claro, não o escuro quente do KDS) porque o re-skin de cada superfície é dos próximos milestones (M22/M23/M24), não deste.

### 2026-09-11 — M21 — `pnpm lint`/`typecheck`/`test`/`build` — PASS
Todos verdes no monorepo inteiro.

### 2026-09-11 — M21 — Gate Git — PASS
PR #28 (`claude/m21-design-system-foundation` → `main`), CI remota verde nos 4 jobs de primeira, merge commit `4f8940b`.

---

## M22 — Cliente (re-skin + tela de detalhe do produto)

### 2026-09-11 — M22 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` respondeu o Gate de Plano: tela de detalhe do produto é um novo `screen` no mesmo componente `CustomerMenu` (não rota Next nova); placeholder de imagem é só um bloco visual (sem upload, fora de escopo — `catalog.ts` M5); chips de categoria filtram a lista já carregada, sem chamada de API nova; adicionar direto do card da lista continua funcionando, sem forçar passar pelo detalhe.

### 2026-09-11 — M22 — G5 UX (visual + regressão) — PASS
- `apps/web/src/components/customer/customer-menu.tsx`: header com badge de marca + selo "Aberto" + chips de categoria (scroll horizontal); cards com raio/sombra do mockup; nova `ProductDetailScreen` (foto placeholder, nome, descrição, preço, stepper de rodapé); `QuantityControl` ganhou variante `full` reaproveitada pelo card E pelo detalhe.
- **Bug real pego testando de verdade no navegador**: o chip sintético "mostrar tudo" tinha o mesmo nome de uma categoria de teste ("Destaques"), duplicando visualmente — corrigido renomeando o chip sintético pra "Todos" (nunca colide com nome de categoria real de um tenant).
- **Correção de acessibilidade pega na própria revisão, não só no teste visual**: o card de produto virou um `<button>` contendo os botões do stepper de quantidade — `<button>` dentro de `<button>` é HTML inválido (nesting de elementos interativos, o browser conserta sozinho de forma imprevisível). Trocado por `<div role="button" tabIndex={0}>` com `onKeyDown` (Enter/Espaço) — mesma semântica de clique, sem aninhar interativos. Retestado: clique no card abre o detalhe, clique no botão de quantidade adiciona ao carrinho SEM abrir o detalhe (dois comportamentos independentes confirmados via DOM real, não só lido no código).
- **[visual, browser real]** Fluxo golden path completo testado com servidor fake local simulando a API pública (mesmo padrão do M9/M10, sem Postgres local — ENV-1) em 375px: abrir mesa → cardápio com chips → abrir detalhe do produto → adicionar ao carrinho pelo detalhe → voltar ao cardápio (card já mostra o stepper sincronizado) → abrir carrinho → enviar pedido → tela de acompanhamento mostra o pedido → "chamar garçom" confirma na tela.

### 2026-09-11 — M22 — `pnpm lint`/`typecheck`/`test`/`build` — PASS
Todos verdes no monorepo inteiro. Nenhuma chamada de API nova — só composição/visual sobre o que já existia desde M7/M8/M10.

### 2026-09-11 — M22 — Gate Git — PASS
PR #29 (`claude/m22-customer-reskin` → `main`), CI remota verde nos 4 jobs de primeira, merge commit `6da6ed2`.

---

## M23 — KDS (re-skin pro tema escuro quente)

### 2026-09-11 — M23 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` respondeu o Gate de Plano: `.kds-theme` reaplicado na página inteira (pareamento + board), não só no board; corrigir o token `--card-warm` do `.kds-theme` antes de usá-lo; zero mudança de lógica de negócio/realtime — reskin puro sobre o que o M20 já construiu.

### 2026-09-11 — M23 — G5 UX (visual + regressão) — PASS
- **Achado real durante a própria preparação dos tokens (antes de tocar na tela)**: revisando a extração de cores do mockup feita mais cedo na sessão, `--card-warm` do `.kds-theme` estava herdado de `var(--surface)` desde o M21 — mesma cor escura do card do ticket. O mockup usa um bege claro (`rgb(250,246,241)`/`rgb(48,41,35)`) nos botões "Iniciar preparo"/"Marcar pronto" mesmo no tema escuro, de propósito (é o destaque da tela). Corrigido em `globals.css`: `.kds-theme` ganhou `--card-warm: #faf6f1` e um `--card-warm-foreground: #302923` novo (par exigido porque o `--foreground` do tema escuro é quase branco, ilegível sobre o bege claro); tema claro ganhou o par simétrico `--card-warm-foreground: var(--foreground)`.
- `apps/web/src/app/(kds)/kds/page.tsx`: classe `.kds-theme` aplicada na raiz de TODOS os retornos (pareamento, erro, carregando, vazio, board) — antes o KDS usava os tokens genéricos claros. Botões "Iniciar preparo"/"Marcar pronto" trocaram de `bg-brand`/`bg-success` pra `bg-card-warm text-card-warm-foreground`; raio dos cards/botões foi de `rounded-md` pra `rounded-lg` (13px, design system novo); badge da tela de pareamento reaproveita o padrão de badge de marca do cliente (ícone sobre `bg-card-warm`).
- **[visual, browser real, `getComputedStyle`]** Servidor fake local (`/v1/kds/tickets`, `/v1/devices/exchange`, `/v1/stream`, sem Postgres — ENV-1) com 3 tickets (novo/em preparo/pronto, um item cancelado). Confirmado via DOM real, não só lido no código: fundo do board `rgb(32,32,32)` (`#202020`); botões de ação `bg rgb(250,246,241)` / `color rgb(48,41,35)` — exatamente o valor extraído do mockup, prova de que a correção do token funcionou; item cancelado com `--danger` do tema escuro (`rgb(224,90,74)`) sobre fundo suave; badge de pareamento com o mesmo par bege/escuro. 375px sem overflow horizontal (`scrollWidth === clientWidth`). Estado vazio ("Nenhum ticket na fila") testado isoladamente (fixture zerada) — fundo/texto corretamente escuro-quente.
- **Regressão**: clique real em "Iniciar preparo" contra a fixture fake mudou o ticket de "Novo" pra "Em preparo" na tela (mesmo padrão de golden path do M20/M22).

### 2026-09-11 — M23 — `pnpm lint`/`typecheck`/`build` — PASS
Rodados na raiz do monorepo (mesmo comando que a CI usa — `pnpm lint` = `eslint .`), verdes. **Nota**: `pnpm --filter @bella/web lint` isoladamente falha por uma regra (`react-hooks/set-state-in-effect`) que só existe no `eslint.config.mjs` local de `apps/web` (via `eslint-config-next`), não no `eslint.config.js` da raiz que a CI de fato roda — confirmado com `git stash` que a falha já existia em `main` antes desta sessão, não é uma regressão introduzida aqui. Divergência de config pré-existente, fora do escopo do M23; não bloqueia porque a CI usa o comando da raiz.

### 2026-09-11 — M23 — Gate Git — PASS
PR #30 (`claude/m23-kds-reskin` → `main`), CI remota verde nos 4 jobs de primeira, merge commit `9e5478f`.

---

## M24 — Admin, parte 1 (re-skin visual das telas existentes)

### 2026-09-11 — M24 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` respondeu o Gate de Plano: ordem de execução por alavancagem (componente/shell compartilhado antes de página individual); zero mudança de lógica/contrato de API; fecha com busca ampla por `rounded-md`/`oklch(` no admin inteiro antes de declarar pronto.

### 2026-09-11 — M24 — G5 UX (visual + regressão) — PASS
- `resource-crud.tsx` (usado por categorias/estações/áreas — 3 telas de uma vez): lista `rounded-md border border-border` → `rounded-lg border border-border-strong` + sombra sutil. Inputs/botões mantidos em `rounded-md` (7px) — já corretos, é o raio de controle do design system, não um resíduo.
- 8 containers de card corrigidos individualmente (não tinham componente compartilhado): `catalog/products/page.tsx` (lista), `dashboard/page.tsx` (`<dl>` de conta), `devices/page.tsx` (card por dispositivo + card do código gerado), `service-requests/page.tsx` (chamado aberto + ticket pronto), `staff-order/page.tsx` (comanda aberta), `tables/page.tsx` (lista de mesas) — todos de `rounded-md border border-border` para `rounded-lg border border-border-strong` + `shadow-[0_8px_24px_rgba(0,0,0,.03)]`.
- Headers/tab-nav de `catalog/layout.tsx` e `tables/layout.tsx` mantidos com `border-border` simples (não são "cards", são divisórias sutis de página — confirmado contra `FRONTEND_GUIDELINES.md §3`: só cards levam `border-strong`+sombra).
- `login/page.tsx` revisado: já usava os tokens do M21 corretamente (`bg-surface`, `bg-brand`, etc.); o único `oklch(...)` restante é um grid decorativo de pontos (`linear-gradient`, branco 5% opacidade) sem token correspondente no design system — decoração estática, não um resíduo de tema a corrigir.
- **[visual, browser real, `getComputedStyle`]** Fixture fake completa (`/v1/me`, `/v1/me/tenants`, `/v1/catalog/*`, `/v1/areas`, `/v1/tables`, `/v1/service-requests`, `/v1/tickets/ready`, `/v1/tabs/open`, `/v1/devices/pairing-codes`, sem Postgres local — ENV-1): dashboard, categorias, dispositivos (incluindo o card de código gerado, testado gerando um de verdade), chamados, pedido pela equipe, mesas — todos confirmados com `border-radius: 13px`, cor de borda `#dddddd` (`--border-strong`) e `box-shadow` com `0.03` de opacidade batendo com o token. 375px sem overflow horizontal.
- **Regressão**: nenhuma mudança de lógica/API — fluxos de CRUD (criar categoria, gerar código de pareamento) testados funcionando ponta a ponta contra a fixture.

### 2026-09-11 — M24 — `pnpm lint`/`typecheck`/`build` — PASS
Rodados na raiz do monorepo (mesmo comando da CI), verdes. Busca ampla confirmou zero `rounded-md border border-border bg-surface` (padrão antigo de card) e zero `oklch(` fora do único uso decorativo já justificado, restantes no admin inteiro.

### 2026-09-11 — M24 — Gate Git — PASS
PR #31 (`claude/m24-admin-reskin-p1` → `main`), merge commit `3abbf6f`. **Nota real**: primeira rodada de CI falhou no job `lint · format · typecheck · unit` — não era lint, era `pnpm format` (prettier --check) reprovando `service-requests/page.tsx`; eu tinha rodado só `pnpm lint`/`typecheck`/`build` localmente, sem `pnpm format`/`pnpm check` completo. Corrigido com `pnpm format:fix` + novo commit; segunda rodada verde nos 4 jobs.

---

## M25 — Admin, parte 2a (comandas/caixa/relatório)

### 2026-09-11 — M25 — G1 Plano — PASS
`docs/ACTIVE_PLAN.md` respondeu o Gate de Plano: só as 4 áreas com API pronta (comandas, fechar comanda, caixa, relatório) — equipe/permissões e configurações exigem endpoint novo, levantado durante a sondagem da API e movido pra M26+; `Idempotency-Key` gerada por tentativa de submit; UI de troco condicional a `method==='cash'`; sem seletor de intervalo customizado no relatório (só "hoje").

### 2026-09-11 — M25 — Verificação de contrato (frente 2 de 3) — PASS
Antes de implementar, li o código real (não a memória da sondagem por subagente) de `apps/api/src/modules/billing/routes.ts`+`service.ts`, `apps/api/src/modules/reports/routes.ts`+`service.ts`, `packages/contracts/src/{billing,payments,reports}.ts` e `packages/domain/src/totals.ts` — confirmei campo a campo os contratos (`BillResult`, `CreatePaymentInput` com a regra `tenderedCents` só em `cash`, `CashSessionCloseSummary`, `DailyReport`) antes de escrever qualquer tela, per regra 12 do `CLAUDE.md` (não confiar em memória/sondagem pra fato verificável).

### 2026-09-11 — M25 — G5 UX (visual + regressão, frente 1 de 3) — PASS
- `apps/web/src/app/(admin)/admin/tabs/page.tsx` (novo): lista de comandas abertas → detalhe com conta, desconto, pagamento (múltiplas formas, troco condicional), fechamento.
- `apps/web/src/app/(admin)/admin/cash/page.tsx` (novo): abrir caixa, sangria/suprimento, fechar com contagem por forma — divergência exibida sempre, nunca escondida (mesma regra do backend).
- `apps/web/src/app/(admin)/admin/reports/page.tsx` (novo): métricas do dia, mais vendidos, descontos/cancelamentos por operador — intervalo fixo "hoje" (00:00 local até agora).
- `dashboard/page.tsx`: links novos pras 3 telas.
- **[visual, browser real, fixture fake stateful]** Fluxo completo testado contra fixture que reproduz o comportamento real da API (desconto reduz saldo, pagamento exige `Idempotency-Key` — CORS da fixture tinha esquecido esse header, bug pego testando de verdade, corrigido): aplicar desconto de 10% → pagar parte em dinheiro com troco (R$ 55/R$ 60 → confirmado R$ 5,00 de troco calculado certo) → pagar parte em pix → saldo chega a 0 → botão "Fechar comanda" aparece → fechar → volta pra lista. Caixa: abrir com R$ 200 → sangria de R$ 50 registrada → tentar fechar sem preencher nenhuma forma é bloqueado com mensagem clara → fechar com R$ 190 contado em dinheiro → divergência de -R$ 10,00 exibida. Relatório: métricas/top produtos/descontos/cancelamentos por operador todos renderizados corretamente. 375px sem overflow horizontal na tela mais densa (detalhe da comanda, com 2 formulários).

### 2026-09-11 — M25 — Regressão de idempotência (frente 3 de 3) — PASS
Dois pagamentos consecutivos na mesma comanda (R$ 55 e R$ 20) cada um incrementou `paidTotalCents` corretamente (55 → 75, não duplicado nem perdido) — prova de que o `crypto.randomUUID()` é gerado a cada `handlePay` (por tentativa de submit), nunca reaproveitado entre chamadas, confirmado pelo efeito real no saldo, não só lendo o código.

### 2026-09-11 — M25 — `pnpm lint`/`format`/`typecheck`/`test`/`build` — PASS
`pnpm check` completo (root) verde. `pnpm build` do `apps/web` gera as 3 rotas novas (`/admin/tabs`, `/admin/cash`, `/admin/reports`) sem erro.

### 2026-09-11 — M25 — Gate Git — PASS
PR #32 (`claude/m25-admin-cash-reports` → `main`), CI remota verde nos 4 jobs de primeira, merge commit `049ad82`.
