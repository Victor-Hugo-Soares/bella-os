# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-10 (M13 concluído e mergeado, sessão Sonnet 5, execução hands-off)
**Fase:** D — Caixa e financeiro (em andamento) · **Milestone concluído:** M13 Sessão de caixa e pagamentos · **Próximo:** M14 Fechamento de caixa e relatórios (`ACTIVE_PLAN.md`)
**Branch:** `main` · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Commit:** `0c600fe` (merge PR #22, M13)
**CI:** verde nos 3 jobs (lint·format·typecheck·unit, integração Postgres — `payments.test.ts` novo, 11 testes; build+smoke). Uma regressão real de teste pega na primeira rodada de CI e corrigida antes do merge (ver `QA_LEDGER.md`).

## 1. Estado funcional do produto
Fase C completa (M8–M11): ciclo cliente→cozinha→salão inteiro pela UI real. M12 deu à comanda a capacidade de calcular o próprio total. M13 acrescenta o dinheiro entrando de verdade: abrir sessão de caixa, registrar pagamento (parcial ou total, multi-forma) contra a comanda, estornar pagamento errado. **O que ainda falta:** fechar a sessão de caixa com contagem/divergência (M14), fechar a comanda de fato, divisão de conta (M15).

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| identity, catálogo, mesas/sessão, cardápio+carrinho | **funcionais (M1–M7)** | — |
| pedido (criação, idempotência, ledger `item_charge`) | **funcional (M8)** | — |
| KDS em tempo real | **funcional (M9)** | — |
| acompanhamento, chamados, expedição | **funcional (M10)** | — |
| cancelamento de item, pedido pela equipe | **funcional (M11)** | transferência de mesa adiada, registrado |
| ledger completo (taxa, couvert, desconto), `GET /bill` | **funcional (M12)** | sem UI própria ainda — só API |
| **sessão de caixa (abrir), pagamento (registrar/estornar)** | **funcional (M13)** | sem UI própria ainda — só API; fechar sessão é M14 |
| fechamento de caixa (contagem, divergência), relatórios | não iniciado | **M14** |
| divisão de conta / Golden Journey completa | não iniciado | M15 |

## 3. Ambiente conhecido
Sem mudança (Docker local com falha, ENV-1; workspace OneDrive, ENV-5; ENV-6 recorrente — voltou a acontecer no meio do M13, pego antes do push graças à checagem obrigatória). Execução hands-off desde 2026-09-10.

## 4. Evidências do M13 (resumo; detalhes em `QA_LEDGER.md`)
- `packages/db/src/schema/billing.ts` (novo): `cashRegisters`, `cashSessions` (índice único parcial — uma sessão aberta por registrador, mesmo padrão de `table_sessions` do M6), `payments`. Migration `0010`. Seed provisiona um "Caixa único" por tenant.
- `POST /v1/tabs/:id/payments`: nunca excede o saldo (`OVERPAYMENT`, código reaproveitado do M0); `Idempotency-Key` obrigatória; troco só existe em dinheiro (3 `refine` no contrato).
- **Concorrência real provada, não só lida no código:** dois pagamentos simultâneos (`Promise.all`) que juntos excedem o saldo — só um vence, o `FOR UPDATE` na comanda (reaproveitando o `computeBill` do M12 dentro da MESMA transação) serializa a corrida.
- `POST /v1/payments/:id/void`: idempotente por construção, mesmo padrão do cancelamento de item do M11.
- **11 testes de integração novos** (Postgres real, CI) + **6 unitários novos** (refine do contrato de pagamento).
- **Regressão real pega pela própria CI**, não bug de produção: um teste assumia um saldo que nunca tinha sido commitado (lock-in de taxa acontece dentro da mesma transação do pagamento e é revertido junto quando o pagamento é rejeitado) — corrigido ajustando o teste para estabelecer o saldo antes de testar a rejeição.

## 5. Decisões que não podem ser esquecidas
**ADR-025, ADR-030, ADR-031** (RLS e exceções de tenant). **ADR-032** (M8: idempotência via `ON CONFLICT DO NOTHING`). **ADR-033** (M9: SSE via polling do outbox). **ADR-034** (M10: acompanhamento por polling; envio de pedido finalmente ligado ao carrinho). Nenhum ADR novo no M11/M12/M13 — decisões específicas de cada milestone ficam registradas no respectivo Gate de Plano (`ACTIVE_PLAN.md`, arquivado por milestone em `QA_LEDGER.md`), não são decisões de arquitetura. **Importante para o M14:** `getBill`/`computeBill` do M12/M13 são a fonte única de verdade do saldo — qualquer cálculo de "esperado por forma de pagamento" no fechamento de caixa deve somar `payments` (que já carrega `cash_session_id`+`method`+`amount_cents`), nunca reimplementar a soma do ledger à parte.

## 6. Perguntas abertas para o Victor
Nenhuma pendência nova. Ver `PRODUCT_CONTEXT.md §2` para o quadro completo (Q6 — pagamento — já respondida em 2026-09-10).

## 7. Dependendo do Victor / pendências operacionais
- Reiniciar a máquina para tentar destravar o Docker Desktop (destravaria o Golden Journey completo com dados reais).
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).

## 8. Próximo passo exato
Executar o **M14** conforme `docs/ACTIVE_PLAN.md`: fechar sessão de caixa (contagem por forma de pagamento vs. esperado, `cash_divergences` — nunca ajustada em silêncio), `cash_movements` (sangria/suprimento), relatórios básicos do turno. **Crítico — 3 frentes** (dinheiro/caixa).
