# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-09 (M2 concluído e mergeado, sessão Sonnet 5)
**Fase:** A — Fundação · **Milestone concluído:** M2 Auth staff, papéis, permissões · **Próximo:** M3 Dispositivos, PIN, observabilidade (`ACTIVE_PLAN.md`)
**Branch:** `main` · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Commit:** `c9bf056` (merge do PR #2, M2)
**CI:** verde nos 3 jobs: quality, integração Postgres (**32/32 testes** em 5 arquivos), build+smoke.

## 1. Estado funcional do produto
Além do M1 (banco, tenant, isolamento por RLS), agora existe:
- **Login de staff funcionando de ponta a ponta**: cadastro, login, sessão via cookie, logout — tudo pela API HTTP real, usando Better Auth.
- **`/v1/me`**: devolve o usuário autenticado a partir da sessão.
- **`requirePermission`**: middleware que resolve, dentro do contexto de tenant do M1, se o usuário logado tem a permissão necessária — provado positivo e negativo para dois papéis diferentes, e provado que um usuário sem membership num tenant não age nele mesmo autenticado.
- **A API agora roda com o papel restrito do banco (`bella_app`)**, não mais com o dono — condição necessária para o isolamento do M1 valer de verdade em tráfego real (gap encontrado e corrigido nesta sessão, ver ADR-024).

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| Documentação/memória | atualizada | 15 documentos em `docs/`, ADR-023/024 do M2 |
| `@bella/domain` | dinheiro, IDs, permissões prontos | — |
| `@bella/db` | schema com identidade + auth (M2), RLS, seed | tabelas de catálogo/mesas/pedidos entram em M5+ |
| `@bella/api` | health/ready + **identity (login, sessão, permissão)** | dispositivos/PIN entram em M3 |
| `apps/web` | não existe | M4 |
| identity | **funcional (M2)**: login, sessão, permissão | dispositivos/PIN é M3; UI é M4 |
| devices/PIN | não iniciado | M3 |
| catalog / tables | não iniciado | M5–M7 |
| ordering / kitchen | não iniciado | M8–M11 |
| ledger / payments / cash | não iniciado | M12–M15 |

## 3. Ambiente conhecido
Sem mudança desde o M1: Docker Desktop local com falha (ENV-1, provavelmente resolve com reboot da máquina — ação pendente do Victor), workspace em OneDrive (ENV-5). CI continua sendo a única frente de integração com Postgres real, e continua provando ser confiável (nenhum teste do M2 rodou localmente; todos passaram na CI — ver §7 para o resultado real assim que a execução terminar).

## 4. Evidências do M2 (resumo; detalhes em `QA_LEDGER.md`)
- `pnpm check` verde localmente (lint, format, typecheck, unit — 40 testes: 29 domain + 3 contracts + 3 db + 5 api).
- `pnpm build` gerou bundle de 41,5 KB (vs. 188 KB do M0 quando `pg` foi acidentalmente embutido) — confirma que `better-auth` ficou `external`, não embutido.
- Smoke manual do bundle compilado: servidor sobe sem banco e com banco inalcançável, sem crash; `/v1/me` sem sessão → 401 estruturado; rota de auth responde (wired, não 404); aviso alto no log quando só `DATABASE_URL` está definida (confirma ADR-024 funcionando).
- **CI final: 32/32 testes de integração verdes** em 5 arquivos (3 do M1 + `auth.test.ts` e `require-permission.test.ts` do M2), rodando como `bella_app` contra Postgres 16 real.
- Dois problemas reais encontrados e corrigidos durante o próprio trabalho (nenhum chegou a produção): (1) a API ainda conectava como dono do banco — ADR-024; (2) `addContentTypeParser('*', ...)` não sobrescrevia o parser default de `application/json` do Fastify, fazendo `sign-up`/`sign-in` chegarem ao Better Auth com corpo vazio — diagnosticado lendo o código-fonte instalado do Fastify depois do erro aparecer na CI, corrigido sobrescrevendo `application/json` explicitamente.

## 5. Decisões que não podem ser esquecidas
Do M2: **ADR-023** (Better Auth: sem plugin Fastify oficial, rota catch-all manual com parser de conteúdo escopado; `usePlural: true`; CLI correta é `auth`, não o `@better-auth/cli` deprecado; IDs continuam UUID v7; `users.password_hash` do M1 removido — senha mora em `accounts.password`). **ADR-024** (API roda como `bella_app`, não mais como dono, a partir de agora — `APP_DATABASE_URL`).

## 6. Perguntas abertas para o Victor
Sem mudança — ver `PRODUCT_CONTEXT.md §2`. Nenhuma pergunta nova no M2.

## 7. Dependendo do Victor / pendências operacionais
- Reiniciar a máquina para tentar destravar o Docker Desktop (não bloqueante — CI cobre a lacuna).
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).
- Nota de ambiente (M2): a conta ativa do GitHub CLI voltou sozinha para `victorlins-dev` no meio da sessão, fazendo um push falhar com 403 antes de ser percebido e corrigido. Toda sessão deve validar `gh auth status` **antes de cada push**, não só uma vez no início.

## 8. Próximo passo exato
Executar o **M3** conforme `docs/ACTIVE_PLAN.md`: pareamento de dispositivos (KDS/caixa), PIN de operador, observabilidade mínima (métricas, `/ready` com detalhe de latência).
