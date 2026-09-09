# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-09 (M3 concluído, sessão Sonnet 5)
**Fase:** A — Fundação · **Milestone concluído:** M3 Dispositivos, PIN, observabilidade · **Próximo:** M4 Web shell + login + design system (`ACTIVE_PLAN.md`)
**Branch:** `claude/m3-devices-pin` (aguardando CI/merge — ver §7) · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git`
**CI:** aguardando confirmação (verificar `gh run list`/`gh pr view` antes de assumir mergeado).

## 1. Estado funcional do produto
Além do login de staff (M2), agora existe:
- **Pareamento de dispositivo**: um gerente gera um código de 6 dígitos; o tablet da cozinha ou o computador do caixa troca esse código por uma credencial de longa duração, sem precisar de login de staff.
- **PIN de operador**: com um dispositivo já autenticado, qualquer funcionário confirma sua identidade com um PIN curto para ações sensíveis — com bloqueio automático depois de tentativas erradas repetidas.
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
Sem mudança de fundo desde o M1 (Docker local com falha, ENV-1; workspace em OneDrive, ENV-5). **Novo (ENV-6):** a conta ativa do GitHub CLI voltou sozinha para `victorlins-dev` três vezes ao longo das sessões M2/M3 do mesmo dia — sempre pega antes de um push real, mas exige checagem em toda sessão, não só no início.

## 4. Evidências do M3 (resumo; detalhes em `QA_LEDGER.md`)
- `pnpm check` verde localmente; `drizzle-kit check` limpo.
- **Duas regressões de build reais encontradas e corrigidas** ao adicionar `@node-rs/argon2` (hash de PIN): o esbuild tentava resolver estaticamente binários nativos de todas as plataformas (corrigido com `external` no tsup), e mesmo assim o bundle não resolvia o pacote em runtime por causa do isolamento de `node_modules` do pnpm (corrigido declarando a dependência também em `apps/api`). Ambas só apareceram rodando o binário compilado de verdade — ver ADR-026.
- 12 testes de integração novos (`devices.test.ts` 7, `pin.test.ts` 5) escritos para rodar como `bella_app` contra Postgres real — resultado da CI: `[preencher após confirmação]`.

## 5. Decisões que não podem ser esquecidas
**ADR-025** (`devices`/`pairing_codes` sem RLS, de propósito — o bootstrap de autenticação de dispositivo não tem tenant conhecido ainda; isolamento garantido na aplicação). **ADR-026** (`@node-rs/argon2` para PIN; precisou virar dependência direta de `apps/api` além de `@bella/domain`, e `external` no tsup — mesma classe de bug do `pg` no M0).

## 6. Perguntas abertas para o Victor
Sem mudança — ver `PRODUCT_CONTEXT.md §2`.

## 7. Dependendo do Victor / pendências operacionais
- Confirmar CI e mergear o PR do M3 antes de começar o M4 (checar `gh pr view`/`gh run list` primeiro em qualquer nova sessão).
- Reiniciar a máquina para tentar destravar o Docker Desktop (não bloqueante).
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).
- ENV-6: se o Victor rodar outra sessão de Claude Code concorrente na mesma máquina noutro projeto GitHub, isso provavelmente explica a troca de conta — vale perguntar a ele.

## 8. Próximo passo exato
Confirmar merge do M3. Depois, executar o **M4** conforme `docs/ACTIVE_PLAN.md`: criar `apps/web` (Next.js), shell com as três superfícies por rota, tela de login usando o M2, aplicando `docs/FRONTEND_GUIDELINES.md`.
