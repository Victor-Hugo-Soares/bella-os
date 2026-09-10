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
