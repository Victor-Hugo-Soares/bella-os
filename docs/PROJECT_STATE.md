# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-09 (sessão de bootstrap com Fable 5.1)
**Fase:** A — Fundação · **Milestone concluído:** M0 Bootstrap · **Próximo:** M1 Banco, tenant e isolamento (`ACTIVE_PLAN.md`)
**Branch:** `main` · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Último commit:** ver `git log -1` (bootstrap: `3197077` docs → `5edffcd` tooling → `28e3763` código → commit de estado)
**CI:** workflow `.github/workflows/ci.yml` criado; primeira execução disparada no push inicial (resultado registrado abaixo em "Evidências").

## 1. Estado funcional do produto
Nenhuma funcionalidade de restaurante existe ainda. Existe:
- API Fastify que sobe, responde `/health` e `/ready` (degrada honestamente sem banco), devolve erros no envelope padronizado com `request_id`, redige credenciais nos logs.
- Módulo de dinheiro (`@bella/domain`) com aritmética em centavos, arredondamento half-even, divisão exata e rateio, formatação/parsing BRL — base de toda a Fase D.
- Contratos de erro e health (`@bella/contracts`).
- Cliente Drizzle + migrator + `withTenant()` (`@bella/db`), sem tabelas ainda.
- Monorepo, lint/format/typecheck/test/build, Postgres via compose, CI com integração.

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| Documentação/memória | completo para handoff | 13 documentos em `docs/` |
| Tooling/CI | pronto | CI valida integração com Postgres real |
| `@bella/domain` | dinheiro pronto e testado | estados/permissões entram em M1/M11 |
| `@bella/contracts` | erros + health | DTOs de negócio a partir de M5 |
| `@bella/db` | cliente + migrator + withTenant | **zero migrations**; M1 |
| `@bella/api` | esqueleto | módulos de negócio a partir de M1 |
| `apps/web` | não existe | M4 (`create-next-app` na versão vigente) |
| identity / tenants | não iniciado | M1–M3 |
| catalog / tables | não iniciado | M5–M7 |
| ordering / kitchen | não iniciado | M8–M11 |
| ledger / payments / cash | não iniciado | M12–M15 |
| inventory / printing / reporting | não iniciado | Fase E |

## 3. Ambiente conhecido
Windows 11, Node 24.18, pnpm 10.34.5, git 2.55, gh 2.96 (conta ativa `Victor-Hugo-Soares`), Docker Desktop 29.6 **com daemon falhando** (ENV-1). Workspace em OneDrive (ENV-5). Detalhes e correções em `KNOWN_ISSUES.md` e `RUNBOOK_DEV.md §7`.

## 4. Evidências do M0 (resumo; detalhes em `QA_LEDGER.md`)
- `pnpm lint`, `pnpm format`, `pnpm typecheck`: verdes.
- `pnpm test`: 26 testes (18 dinheiro, 3 contratos, 5 API) verdes.
- `pnpm build` + execução do bundle em modo produção: `/health` ok (versão 0.0.1), `/ready` degraded/not_configured, 404 em envelope. Um bug real de empacotamento (`pg` embutido) foi encontrado pelo smoke e corrigido.
- Integração com Postgres (`apps/api/test/integration/db.test.ts`): **não executada localmente** (Docker). Validação pela CI — anotar aqui o resultado: `[CI run #1: ver gh run list]`.

## 5. Decisões que não podem ser esquecidas
ADR-001 a ADR-018 em `DECISIONS.md`. As mais estruturantes: monólito modular TS (001); Postgres + centavos (002); Drizzle (003); tenant_id + RLS (004); Better Auth + dispositivo/PIN + token de mesa (005); SSE com outbox (006); idempotência por chave (007); ledger append-only (008); pagamento manual no MVP (009); QR fixo com confirmação (010); cloud-first Railway (011); identidade Git do projeto (015).

## 6. Perguntas abertas para o Victor (não bloqueantes agora)
Q1–Q14 em `PRODUCT_CONTEXT.md §2`. Urgência: Q14 (repositório público → privado) agora; Q1/Q2/Q3/Q6 antes da Fase D; Q5 antes de qualquer promessa fiscal; Q10–Q13 na Fase F.

## 7. Dependendo do Victor
- Decidir se torna o repositório privado (recomendado).
- Corrigir o Docker Desktop (passos em `RUNBOOK_DEV.md §7`) **ou** aceitar fallback (Postgres local/Railway) — Sonnet pode seguir usando a CI como frente de integração enquanto isso, mas o ciclo local fica mais lento.
- Opcional: tirar a pasta do OneDrive.

## 8. Gate de Handoff Fable → Sonnet (executado em 2026-09-09)
| Pergunta | Onde está a resposta | Status |
|----------|----------------------|--------|
| O que estamos construindo? | `PRODUCT_CONTEXT.md §1, 3, 4, 5` | ok |
| Por quê? | `PRODUCT_CONTEXT.md §1, 6`; `PRODUCT_NOTES.md` (observações de operação) | ok |
| Arquitetura | `ARCHITECTURE.md`; `DOMAIN_MODEL.md` | ok |
| Estado atual | este arquivo | ok |
| Próximo passo exato | `ACTIVE_PLAN.md` (M1, com arquivos, testes e aceite) | ok |
| O que NÃO fazer | `ARCHITECTURE.md §13`; `PRODUCT_NOTES.md` "não recomendado"; `PRODUCT_CONTEXT.md §5` não-objetivos; regras absolutas em `CLAUDE.md` | ok |
| Decisões tomadas | `DECISIONS.md` | ok |
| Questões abertas | `PRODUCT_CONTEXT.md §2`; `KNOWN_ISSUES.md` | ok |
| Quais testes executar | `TESTING_STRATEGY.md`; comandos em `RUNBOOK_DEV.md §3` | ok |
| Quais gates passar | `BELLA_OS_AUTONOMOUS_HANDOFF.md §4`; `ROADMAP.md` (gate por milestone); `QA_LEDGER.md` (formato) | ok |
| Como falar com Victor | `CLAUDE.md` "Comunicação"; handoff §9 | ok |
| Como preservar memória | `CLAUDE.md` "Compactação"; handoff §7 | ok |
