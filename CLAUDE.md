# CLAUDE.md — Bella OS

> Memória operacional quente do projeto. Leia no início de cada sessão; atualize antes de compactar contexto, trocar de fase ou encerrar um bloco. Governança completa: `docs/BELLA_OS_AUTONOMOUS_HANDOFF.md`.

## Missão

Construir e operar o Bella OS: sistema completo de restaurante para o Bella III (Franco da Rocha/SP), arquitetado desde o início para múltiplos restaurantes (SaaS). Três superfícies: Cliente mobile via QR, Produção/KDS (cozinha, pizzaria, bar) e Administração/Caixa. Critério real de sucesso: operar uma sexta-feira lotada sem pedido perdido, duplicado ou conta errada.

## Ordem de leitura ao iniciar uma sessão

1. Este arquivo. 2. `docs/PROJECT_STATE.md`. 3. `docs/ACTIVE_PLAN.md`. 4. Documentos citados pelo plano (normalmente `docs/DOMAIN_MODEL.md` e `docs/ARCHITECTURE.md`). 5. `git status`, branch, último commit, `gh auth status`.

## GitHub e identidade (gate G0 em toda sessão)

- Repositório: `https://github.com/Victor-Hugo-Soares/bella-os.git` (branch `main`).
- Identidade local do repo: `Victor Hugo <116037876+Victor-Hugo-Soares@users.noreply.github.com>`. Conferir com `git config user.email`.
- A máquina tem outras contas no GitHub CLI. Antes de push: `gh auth status` deve mostrar `Victor-Hugo-Soares` ativa (senão `gh auth switch --user Victor-Hugo-Soares`).
- Branches de trabalho `claude/<tema>`; `main` só com CI verde. Nunca force-push em `main`.

## Regras absolutas

1. Planejar antes de implementar qualquer bloco relevante (`docs/ACTIVE_PLAN.md`) e passar o Gate de Plano.
2. Nenhuma feature é considerada pronta com uma única evidência. Mudança normal: 2 frentes independentes. Dinheiro, comanda, autenticação, permissão, cancelamento, fiscal, pagamento, estoque, tenant: 3 frentes.
3. Se um teste falhar: reproduzir, diagnosticar, corrigir, retestar. Não parar para pedir ajuda por problema técnico comum.
4. Só parar para o Victor em dúvida realmente bloqueante, informação exclusiva do restaurante, credencial indisponível, ação irreversível não autorizada ou dependência externa comprovada.
5. Falar com o Victor em português brasileiro claro, traduzindo estado técnico em impacto real; IDs internos nunca substituem a explicação.
6. Multi-tenant é princípio: Bella é tenant/configuração, nunca `if` no núcleo. Toda tabela de negócio tem `tenant_id`; toda query de negócio roda dentro de `withTenant()`.
7. Dinheiro é inteiro em centavos, calculado e validado no servidor; preço nunca vem do cliente; snapshot de preço no item; ledger append-only.
8. Mutações críticas são idempotentes (`Idempotency-Key`), transacionais e auditadas.
9. Nunca commitar `.env`, tokens, chaves, dumps reais.
10. Acesso amplo ao PC não autoriza vasculhar arquivos pessoais sem relação com o projeto.
11. Antes de compactar contexto, persistir toda memória necessária no repositório.
12. Não confiar na memória do modelo para versão/API de biblioteca: conferir documentação oficial + código instalado (ex.: Better Auth antes do M2).

## Loop obrigatório de execução

Reconhecimento → Plano → Gate do Plano → Execução incremental → Testes locais → Verificação independente → Gate de Qualidade → Gate de Integração → Atualização da memória/docs → Revisão Git → Gate de Etapa → Próximo trabalho. FAIL = corrigir e repetir. BLOCKED = só condições humanas/externas reais.

## Regra anti-falso-positivo/negativo

Frentes independentes: lint/typecheck/build · unit · integração (Postgres real) · E2E browser · chamada real à API · consulta independente ao banco · logs/request_id · permissão positiva + negativa · visual mobile · falha/timeout/retry · regressão adjacente · concorrência/idempotência. `200 OK`, build verde ou "abriu na tela" isoladamente não provam nada. Lição do M0: o build passou e o bundle quebrou em execução; o smoke pegou.

## Gates resumidos

G0 ambiente/identidade · G1 plano · G2 dados/contratos · G3 feature · G4 integração cliente→cozinha→caixa · G5 UX/mobile · G6 segurança/tenant/negação · G7 dinheiro/comanda/caixa · G8 KDS/realtime · G9 observabilidade/recuperação · G10 release. Detalhes: handoff §4. Gate de saída por milestone: `docs/ROADMAP.md`. Evidências: `docs/QA_LEDGER.md`.

## Estado atual

- Fase: **D completa** (M8–M15). Fase **E** (M16/M18/M20) concluída 2026-09-10. **Nova frente 2026-09-11: handoff de design** — Victor desenhou as 20 telas do produto no Claude Design e aprovou a direção visual (diferente do dark-oklch antigo); pediu handoff completo, implementação autônoma, ele confere no final ("gostei mt mais d seu... vamos implementar e quando tiver full pronto eu verifico tudo"). **M21–M25 concluídos e mergeados** (2026-09-11): fundação do design system, re-skin das 3 superfícies (cliente/KDS/admin) + comandas/caixa/relatório do dia (telas novas pra API que já existia desde M12–M16). Detalhes: `docs/ACTIVE_PLAN.md`.
- Ambiente: Windows 11, Node 24, pnpm 10.34.5, gh ativo `Victor-Hugo-Soares` (**checar `gh auth status` imediatamente antes de CADA push** — volta sozinho para outra conta com frequência, ver ENV-6); Docker Desktop com falha (ENV-1); workspace em OneDrive (ENV-5). CI é a frente de integração — já provada confiável (16+ bugs/gaps reais entre M0–M20). **Rodar `pnpm check` (root) antes de push, não só lint/typecheck/build isolados** — `apps/web` tem seu próprio `eslint.config.mjs` mais estrito que o da CI, e `pnpm format` (prettier) já pegou uma regressão que lint sozinho não pegava (M24).
- **Modo de execução: hands-off desde 2026-09-10.**
- Branch: `main`. Último commit: merge PR #32 (M25), `049ad82`. CI verde nos **4 jobs** de primeira em M21–M25, sem regressão.
- **Confirmado pelo Victor (2026-09-10):** pagamento na maquininha física, ADMIN dá baixa manual, sem PSP/TEF (`docs/PRODUCT_CONTEXT.md §2` Q6). Cozinha só tela por enquanto (Q7).
- **Lição real do M20, vale pra qualquer stream futuro:** um comentário SSE (`: texto`) é invisível ao `EventSource` do browser — nenhum handler dispara. Qualquer sinal que o cliente precise reagir tem que ser um evento nomeado de verdade.
- Último gate aprovado: **M25 — Gate Git PASS** (PR #32, `049ad82`).
- Bloqueios: nenhum bloqueio técnico. M26 (equipe/permissões + configurações) precisa de **backend novo** (endpoints não existem, só chaves de permissão reservadas) e de decisões de produto (fluxo de convite de equipe, papéis fixos vs. permissão granular, quais campos de `tenant_settings` expor) — ver perguntas em aberto em `docs/ACTIVE_PLAN.md`.

## Próximo passo exato

**M26 — Equipe/permissões e configurações.** Gate de Plano ainda não respondido — ver as 4 perguntas em aberto na seção do M26 em `docs/ACTIVE_PLAN.md` (fluxo de convite, papéis vs. permissão granular, campos reais de `tenant_settings`, conferir o canvas do Claude Design pras 12 telas de admin) antes de desenhar schema/rotas novas.

## Arquitetura atual (resumo; detalhes em `docs/ARCHITECTURE.md`)

- Forma: monólito modular TypeScript em monorepo pnpm. `apps/api` (Fastify 5, REST + SSE), `apps/web` (Next.js 16 App Router, três superfícies por rota — shell criado no M4, só login tem conteúdo real), `packages/{domain,contracts,db,config}`.
- Banco: PostgreSQL 16 via Drizzle ORM; migrations SQL versionadas; `tenant_id` em toda tabela de negócio + RLS declarada na própria schema (`pgPolicy`/`.enableRLS()`, ADR-021) via `withTenant()`/`withoutTenant()`; papel de aplicação `bella_app` sem BYPASSRLS e sem ser dono (ADR-020, provado no M1); dinheiro `bigint` centavos; status `text` + `CHECK`; UUID v7 (`@bella/domain newId()`, ADR-019).
- Auth: Better Auth 1.7.3 (staff, email+senha — login, sessão, `/v1/me`, `requirePermission()`, M2) + dispositivos pareados com token escopado (SHA-256) + PIN de operador (argon2id via `@node-rs/argon2`, bloqueio por tentativas — **funcional desde o M3**); cliente com token de sessão de mesa assinado em cookie httpOnly (Fase B). Permissões por chaves fixas em `@bella/domain/permissions.ts`, checadas no servidor. API roda como `bella_app` (`APP_DATABASE_URL`), não como dono do banco (ADR-024). `devices`/`pairing_codes` são as únicas tabelas de negócio sem RLS, de propósito (ADR-025).
- Realtime: SSE por canais com outbox `domain_events` e replay por `Last-Event-ID`; polling de segurança no KDS.
- Filas: tabela `jobs` no Postgres (`SKIP LOCKED`). Sem Redis, sem WebSocket, sem microserviços.
- Hosting: Railway (api, web, Postgres; staging + production). Cloud-first; sem mutação offline no KDS/caixa; recomendação de failover 4G ao restaurante.
- Observabilidade: pino JSON com `request_id`/`tenant_id`, `/health`, `/ready`, `audit_log`.
- Testes: Vitest (unit + integração com Postgres real), Playwright (E2E), `fastify.inject()`; Golden Journey em `docs/TESTING_STRATEGY.md`.
- Frontend: Tailwind v4 + shadcn customizado, Schibsted Grotesk / Switzer / JetBrains Mono, oklch, Lucide, pt-BR — `docs/FRONTEND_GUIDELINES.md`.

## Comandos oficiais

```bash
pnpm install
pnpm db:up && pnpm db:migrate          # Postgres local (compose, porta 5433) + migrations
pnpm dev                               # API http://localhost:3001/health
pnpm check                             # lint + format + typecheck + unit (= job quality da CI)
pnpm test:integration                  # exige TEST_DATABASE_URL (Postgres real)
pnpm build && pnpm --filter @bella/api start
pnpm db:generate | pnpm db:check       # migrations Drizzle
```

## Memória persistente

- `CLAUDE.md` — regras + estado resumido + índice (manter < ~12–15k tokens).
- `docs/PROJECT_STATE.md` — estado detalhado · `docs/ACTIVE_PLAN.md` — plano e próximo passo exato · `docs/DECISIONS.md` — ADRs · `docs/QA_LEDGER.md` — gates e evidências · `docs/KNOWN_ISSUES.md` — riscos, incógnitas, ambiente · `docs/PRODUCT_NOTES.md` — ideias classificadas · `docs/memory/archive/` — histórico.
- Referência: `docs/PRODUCT_CONTEXT.md`, `docs/ARCHITECTURE.md`, `docs/DOMAIN_MODEL.md`, `docs/ROADMAP.md`, `docs/TESTING_STRATEGY.md`, `docs/FRONTEND_GUIDELINES.md`, `docs/RUNBOOK_DEV.md` (setup da máquina), `docs/RUNBOOK_INCIDENTS.md` (M18 — o que fazer quando algo dá errado em produção: API fora do ar, Postgres inacessível, restaurar backup), `docs/BELLA_OS_AUTONOMOUS_HANDOFF.md` (governança), `docs/source/` (docx original).

## Compactação de contexto

Gatilho preventivo ~80k tokens de sessão; 100k limite desejado. Sem contador: após 8–12 tarefas substanciais, fim de milestone, troca de domínio, antes de release ou quando decisões existirem só na conversa. Antes de compactar: `git status` → atualizar `PROJECT_STATE` → `ACTIVE_PLAN` com próximo passo exato → `DECISIONS` → `QA_LEDGER` → `KNOWN_ISSUES` → `PRODUCT_NOTES` → este arquivo → registrar branch/commit → checkpoint → compactar → reler 1–3 antes de tocar código.

## Comunicação com Victor

Sempre: o que fiz · como provei · resultado · o que falta · se ele precisa fazer algo e exatamente o quê. Perguntas só quando bloqueantes, consolidadas, com opções e recomendação. Perguntas abertas de produto (com defaults já adotados): `docs/PRODUCT_CONTEXT.md §2`.

## Fonte de verdade documental

Se documentos e código divergirem, investigar, obter evidência e corrigir a fonte desatualizada; nunca ignorar contradição importante.
