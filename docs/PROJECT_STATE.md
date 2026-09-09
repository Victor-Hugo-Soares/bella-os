# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-09 (M1 concluído, sessão iniciada com Fable 5.1 e continuada com Sonnet 5)
**Fase:** A — Fundação · **Milestone concluído:** M1 Banco, tenant e isolamento · **Próximo:** M2 Auth staff, papéis, permissões (`ACTIVE_PLAN.md`)
**Branch:** `main` · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Commit:** `ba348bd` (merge do PR #1, M1)
**CI:** `.github/workflows/ci.yml` — **verde** em `main`: quality, integração com Postgres 16 (19/19 testes), build + smoke.

## 1. Estado funcional do produto
Nenhuma tela ou fluxo de restaurante existe ainda (isso começa na Fase B). O que existe é a fundação de dados e o esqueleto de API:
- Banco com 12 tabelas (tenant/organização, configurações por tenant, identidade mínima, papéis/permissões, auditoria, outbox de eventos, idempotência, fila de jobs).
- **Isolamento entre restaurantes provado de verdade**: o papel restrito `bella_app` (sem BYPASSRLS, não é dono das tabelas) nunca vê linha de outro tenant, mesmo tentando via SQL bruto; insert com tenant errado é rejeitado pelo próprio banco; sem contexto, zero linhas aparecem.
- Seed idempotente com dois restaurantes fictícios (`bella`, `demo`), cada um com os 5 papéis padrão (dono, gerente, caixa, garçom, cozinha) e as permissões corretas por papel.
- API Fastify com `/health`, `/ready`, envelope de erro padronizado, dinheiro em centavos testado, geração de IDs (UUID v7).

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| Documentação/memória | atualizada | 15 documentos em `docs/`, incluindo ADR-019 a ADR-022 do M1 |
| Tooling/CI | maduro | CI roda migrations + configura `bella_app` + testes de integração reais |
| `@bella/domain` | dinheiro, IDs (UUID v7) e permissões prontos e testados | máquinas de estado de pedido/pagamento entram em M8+ |
| `@bella/contracts` | erros + health | DTOs de negócio a partir de M5 |
| `@bella/db` | schema completo do M1, RLS, seed, papel `bella_app` | tabelas de catálogo/mesas/pedidos entram em M5+ |
| `@bella/api` | esqueleto + testes de integração de banco | rotas de negócio a partir de M2 (auth) |
| `apps/web` | não existe | M4 (`create-next-app` na versão vigente) |
| identity (tenants, roles, memberships) | **modelo pronto (M1)**; login real pendente | M2 integra Better Auth |
| devices/PIN | não iniciado | M3 |
| catalog / tables | não iniciado | M5–M7 |
| ordering / kitchen | não iniciado | M8–M11 |
| ledger / payments / cash | não iniciado | M12–M15 |
| inventory / printing / reporting | não iniciado | Fase E |

## 3. Ambiente conhecido
Windows 11, Node 24.18, pnpm 10.34.5, git 2.55, gh 2.96 (conta ativa `Victor-Hugo-Soares`). **Docker Desktop continua com falha** (ENV-1) — diagnosticado como erro Windows 1920 num socket órfão; provavelmente resolve com reinício da máquina, ação pendente do Victor. Workspace em OneDrive (ENV-5, não resolvido). A CI é a frente de integração enquanto isso persistir — já provada confiável no M1 (pegou 2 bugs reais).

## 4. Evidências do M1 (resumo; detalhes em `QA_LEDGER.md`)
- `pnpm check` (lint + format + typecheck + unit) verde localmente antes de cada push.
- `drizzle-kit check` verde (RLS modelada via DSL do drizzle-orm, sem colisão de snapshot — ADR-021).
- **CI (Postgres 16 real): 19/19 testes de integração verdes**, cobrindo os 6 critérios do plano (a isolamento cruzado, b insert rejeitado, c sem contexto = zero linhas, d papel sem bypass/não-dono, e transação atômica com auditoria+outbox, f UNIQUE de idempotência).
- Dois bugs reais encontrados pela própria CI e corrigidos com evidência: `ALTER ROLE ... PASSWORD $1` (DDL não aceita parâmetro nessa posição — ADR-022) e asserções de teste checando `.message` em vez de `.cause` do erro do drizzle-orm (não era bug de isolamento — 17/19 testes já passavam na mesma execução).
- PR #1 mergeado em `main` com os 3 jobs de CI verdes.

## 5. Decisões que não podem ser esquecidas
ADR-001 a ADR-018 (bootstrap) em `DECISIONS.md`. Do M1: **ADR-019** (UUID v7 via pacote `uuidv7`), **ADR-020** (um único papel de banco — `bella_app` — em vez dos dois planejados originalmente; o dono do banco migra e semeia), **ADR-021** (RLS e o papel de aplicação são declarados na DSL do drizzle-orm — `pgPolicy`/`pgRole`/`.enableRLS()` — não em SQL manual; GRANT/REVOKE continuam manuais por não serem modelados pela DSL), **ADR-022** (`ALTER ROLE ... PASSWORD` exige literal, não `$1`; usar `pg.escapeLiteral`).

## 6. Perguntas abertas para o Victor (não bloqueantes agora)
Sem mudança desde o bootstrap — ver `PRODUCT_CONTEXT.md §2`. Nenhuma pergunta nova surgiu no M1 (foi um milestone só de fundação técnica).

## 7. Dependendo do Victor
- Reiniciar a máquina (ou apagar `AppData\Local\Docker\run` como Administrador) para tentar destravar o Docker Desktop — não bloqueante, a CI cobre a lacuna.
- Decidir se torna o repositório privado (recomendado, ainda pendente).

## 8. Próximo passo exato
Executar o **M2** conforme `docs/ACTIVE_PLAN.md`: integrar Better Auth para login de staff, expor `requirePermission()` lendo as permissões já semeadas no M1, e provar autenticação positiva/negativa e isolamento entre tenants também no nível de sessão HTTP.
