# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-10 (M11 concluído e mergeado — **Fase C completa**, sessão Sonnet 5, execução hands-off)
**Fase:** D — Caixa e financeiro (a começar) · **Milestone concluído:** M11 Cancelamentos e pedido pela equipe (fecha a Fase C) · **Próximo:** M12 Ledger, taxas, couvert, descontos (`ACTIVE_PLAN.md`)
**Branch:** `main` · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Commit:** `2a2ecaf` (merge PR #19, M11)
**CI:** verde nos 3 jobs (lint·format·typecheck·unit, integração Postgres — **87/87 testes** em 15 arquivos, build+smoke).

## 1. Estado funcional do produto — Fase C completa
O ciclo operacional inteiro do restaurante (menos dinheiro trocando de mãos) já funciona de ponta a ponta, pela UI de verdade: cliente escaneia QR → vê cardápio → monta carrinho → envia pedido → acompanha status → chama garçom/pede a conta. Cozinha vê e prepara em tempo real. Staff pode lançar pedido em nome de uma mesa, cancelar item (antes ou depois de ir para a cozinha, com o ledger sempre correto), aceitar/rejeitar pedido de sessão não verificada. **O que falta para o restaurante operar de verdade:** caixa, pagamento, fechamento — Fase D inteira.

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| identity, catálogo, mesas/sessão, cardápio+carrinho | **funcionais (M1–M7)** | — |
| pedido (criação, idempotência, ledger `item_charge`) | **funcional (M8)** | — |
| KDS em tempo real | **funcional (M9)** | — |
| acompanhamento, chamados, expedição | **funcional (M10)** | — |
| **cancelamento de item, pedido pela equipe** | **funcional (M11)** | transferência de mesa adiada, registrado |
| ledger completo (taxa, couvert, desconto) | não iniciado | **M12** |
| caixa / pagamentos | não iniciado | M13–M14 |
| divisão de conta / Golden Journey completa | não iniciado | M15 |

## 3. Ambiente conhecido
Sem mudança (Docker local com falha, ENV-1; workspace OneDrive, ENV-5; ENV-6 recorrente, sempre pego antes do push). Execução hands-off desde 2026-09-10.

## 4. Evidências do M11 (resumo; detalhes em `QA_LEDGER.md`)
- `PATCH /v1/orders/:orderId/items/:itemId/cancel`: antes da produção sempre reverte total; depois da produção exige `chargeOnCancel` explícito. Idempotente por construção (nunca reverte duas vezes).
- **87/87 testes de integração verdes** (80 de M1–M10 + 7 novos M11), incluindo os dois casos de `charge_on_cancel` testados separadamente com consulta independente ao ledger.
- KDS destaca item cancelado em tempo real (SSE já escutava `order.created`, agora também `item.cancelled`).
- `/admin/staff-order`: pedido pela equipe — a API existia desde o M8, só faltava a tela.
- **Escopo cortado conscientemente:** transferência/junção de mesa (`table_session_transfers`) fica para depois — problema à parte com concorrência própria, não bloqueia nada do que já existe.

## 5. Decisões que não podem ser esquecidas
**ADR-025, ADR-030, ADR-031** (RLS e exceções de tenant). **ADR-032** (M8: idempotência via `ON CONFLICT DO NOTHING`). **ADR-033** (M9: SSE via polling do outbox). **ADR-034** (M10: acompanhamento por polling; envio de pedido finalmente ligado ao carrinho — achado real de produto). Nenhum ADR novo no M11 (decisões de cancelamento seguiram os padrões já estabelecidos, sem novidade de arquitetura).

## 6. Perguntas abertas para o Victor
**Q6 respondida pelo Victor em 2026-09-10:** pagamento continua na maquininha de cartão física, fora do sistema; o ADMIN faz a baixa manual (registra pagamento) no sistema. Isso confirma o default já adotado (`PRODUCT_CONTEXT.md §2` Q6) — **sem integração de PSP/TEF no M13**, o M13 é só registro manual de pagamento pelo caixa/admin contra o ledger. Demais perguntas sem mudança — ver `PRODUCT_CONTEXT.md §2`.

## 7. Dependendo do Victor / pendências operacionais
- Reiniciar a máquina para tentar destravar o Docker Desktop (destravaria o Golden Journey completo com dados reais).
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).

## 8. Próximo passo exato
Executar o **M12** conforme `docs/ACTIVE_PLAN.md`: cálculo de totais no servidor (taxa de serviço opcional/obrigatória, couvert, desconto com permissão), `GET /tabs/:id/bill`. **Crítico — 3 frentes** (dinheiro).
