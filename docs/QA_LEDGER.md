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
