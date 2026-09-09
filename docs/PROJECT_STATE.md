# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-09 (M3 concluído e mergeado, sessão Sonnet 5)
**Fase:** A — Fundação · **Milestone concluído:** M3 Dispositivos, PIN, observabilidade · **Próximo:** M4 Web shell + login + design system (`ACTIVE_PLAN.md`)
**Branch:** `main` · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Commit:** `a751062` (merge do PR #3, M3)
**CI:** verde nos 3 jobs: quality, integração Postgres (**45/45 testes** em 7 arquivos), build+smoke.

## 1. Estado funcional do produto
Além do login de staff (M2), agora existe:
- **Pareamento de dispositivo**: um gerente gera um código de 6 dígitos; o tablet da cozinha ou o computador do caixa troca esse código por uma credencial de longa duração, sem precisar de login de staff.
- **PIN de operador**: com um dispositivo já autenticado, qualquer funcionário confirma sua identidade com um PIN curto para ações sensíveis — com bloqueio automático depois de tentativas erradas repetidas, provado de verdade (a 5ª tentativa bloqueia, o bloqueio expira).
- **`/ready` agora informa a latência do banco**, primeiro passo de observabilidade real.

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| identity (login, sessão, permissão, dispositivo, PIN) | **funcional (M1–M3)** | UI é M4 |
| `@bella/domain` | dinheiro, IDs, permissões, PIN, token de dispositivo | tudo testado e pesquisado antes de codar |
| `@bella/db` | schema com identidade + auth + devices | catálogo/mesas/pedidos entram em M5+ |
| `apps/web` | não existe | M4 |
| catalog / tables | não iniciado | M5–M7 |
| ordering / kitchen | não iniciado | M8–M11 |
| ledger / payments / cash | não iniciado | M12–M15 |

## 3. Ambiente conhecido
Sem mudança de fundo desde o M1 (Docker local com falha, ENV-1; workspace em OneDrive, ENV-5). **ENV-6** (novo): a conta ativa do GitHub CLI voltou sozinha para `victorlins-dev` três vezes ao longo das sessões M2/M3 do mesmo dia — sempre pega antes de um push real (nunca vazou), mas exige checagem em toda sessão, não só no início.

## 4. Evidências do M3 (resumo; detalhes em `QA_LEDGER.md`)
- `pnpm check` verde localmente; `drizzle-kit check` limpo.
- **Duas regressões de build reais** encontradas e corrigidas ao adicionar `@node-rs/argon2` (hash de PIN): esbuild tentando resolver binários nativos de todas as plataformas (corrigido com `external` no tsup) e o bundle não resolvendo o pacote em runtime por isolamento do pnpm (corrigido declarando a dependência também em `apps/api`) — ver ADR-026.
- **Um bug real de produção** encontrado pela CI: `verifyMembershipPin` lançava erro de dentro da própria transação que gravava a tentativa de PIN incorreta, e o Postgres desfazia (ROLLBACK) esse registro — o bloqueio por tentativas nunca funcionava de fato. Corrigido separando "decidir e persistir" (dentro da transação, sempre commit) de "lançar erro para o chamador" (fora, depois do commit) — ver ADR-026 e QA_LEDGER.
- **Um bug real de setup de teste** (não de produção): consultas via conexão de dono sem filtro explícito de tenant pegavam o papel do tenant errado, já que o dono ignora RLS — ver ADR-027.
- **CI final: 45/45 testes de integração verdes** em 7 arquivos (5 do M1+M2 + `devices.test.ts` e `pin.test.ts` do M3).

## 5. Decisões que não podem ser esquecidas
**ADR-025** (`devices`/`pairing_codes` sem RLS, de propósito — bootstrap de autenticação de dispositivo não tem tenant conhecido ainda; isolamento garantido na aplicação). **ADR-026** (`@node-rs/argon2` para PIN; duas regressões de build reais; bug de transação real no bloqueio de PIN). **ADR-027** (consultas de teste via conexão de dono precisam filtrar `tenant_id` explicitamente — `withTenant` sozinho não filtra quando a conexão ignora RLS).

## 6. Perguntas abertas para o Victor
Sem mudança — ver `PRODUCT_CONTEXT.md §2`.

## 7. Dependendo do Victor / pendências operacionais
- Reiniciar a máquina para tentar destravar o Docker Desktop (não bloqueante).
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).
- ENV-6: se o Victor rodar outra sessão de Claude Code concorrente na mesma máquina noutro projeto GitHub, isso provavelmente explica a troca de conta — vale perguntar a ele.

## 8. Próximo passo exato
Executar o **M4** conforme `docs/ACTIVE_PLAN.md`: criar `apps/web` (Next.js), shell com as três superfícies por rota, tela de login usando o M2, aplicando `docs/FRONTEND_GUIDELINES.md`. Antes de codar, confirmar a versão atual do Next.js/App Router (regra 12).
