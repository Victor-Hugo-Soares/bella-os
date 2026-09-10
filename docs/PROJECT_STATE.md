# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-10 (M12 implementado, aguardando CI/merge da PR — sessão Sonnet 5, execução hands-off)
**Fase:** D — Caixa e financeiro (em andamento) · **Milestone em fechamento:** M12 Ledger, taxas, couvert, descontos · **Próximo:** M13 Sessão de caixa e pagamentos (`ACTIVE_PLAN.md`)
**Branch:** `claude/m12-totals-ledger` (PR aberta) · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Último commit em `main`:** `90b8f02` (docs Q6)
**CI:** local verde (lint·format·typecheck·unit·build); integração Postgres (novos testes de `billing.test.ts`) roda só na CI remota — ENV-1 (sem Docker local).

## 1. Estado funcional do produto
Fase C completa (M8–M11): ciclo cliente→cozinha→salão inteiro pela UI real. M12 acrescenta o lado financeiro que faltava: a comanda agora sabe calcular seu próprio total (itens, taxa de serviço, couvert, desconto) — `GET /v1/tabs/:id/bill` — mas ainda não existe pagamento nem fechamento de comanda; isso é o M13/M14.

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| identity, catálogo, mesas/sessão, cardápio+carrinho | **funcionais (M1–M7)** | — |
| pedido (criação, idempotência, ledger `item_charge`) | **funcional (M8)** | — |
| KDS em tempo real | **funcional (M9)** | — |
| acompanhamento, chamados, expedição | **funcional (M10)** | — |
| cancelamento de item, pedido pela equipe | **funcional (M11)** | transferência de mesa adiada, registrado |
| **ledger completo (taxa, couvert, desconto), `GET /bill`** | **funcional (M12)** | sem UI própria ainda — só API; tela de caixa vem no M13/M14 |
| caixa / pagamentos | não iniciado | **M13–M14** |
| divisão de conta / Golden Journey completa | não iniciado | M15 |

## 3. Ambiente conhecido
Sem mudança (Docker local com falha, ENV-1; workspace OneDrive, ENV-5; ENV-6 recorrente, sempre pego antes do push). Execução hands-off desde 2026-09-10.

## 4. Evidências do M12 (resumo; detalhes em `QA_LEDGER.md`)
- `packages/domain/src/totals.ts`: função pura, fórmula do `DOMAIN_MODEL.md §4`, reaproveita `applyBps`/`round_half_even` (nunca reimplementa arredondamento). 12 testes unitários novos.
- `GET /v1/tabs/:id/bill`: reconstrói tudo a partir do ledger (não de `order_items` — mesmo princípio de "consulta independente" do M11); trava `service_fee`/`couvert` na primeira consulta (idempotente por construção: `FOR UPDATE` na comanda + checagem de existência, testado inclusive com duas chamadas concorrentes reais via `Promise.all`).
- `POST /v1/tabs/:id/discounts`: percentual ou fixo, motivo obrigatório, `discounts.apply`; desconto maior que o saldo é **rejeitado** (nunca limitado a zero em silêncio — decisão registrada no Gate de Plano).
- **8 testes de integração novos** (Postgres real, CI) + **12 unitários novos** em `totals.test.ts`.
- Nenhuma migration nova — schema (`tenant_settings`, `ledger_entries.type`) já suportava tudo desde M0/M1.

## 5. Decisões que não podem ser esquecidas
**ADR-025, ADR-030, ADR-031** (RLS e exceções de tenant). **ADR-032** (M8: idempotência via `ON CONFLICT DO NOTHING`). **ADR-033** (M9: SSE via polling do outbox). **ADR-034** (M10: acompanhamento por polling; envio de pedido finalmente ligado ao carrinho — achado real de produto). Nenhum ADR novo no M11. M12 também sem ADR novo — decisões específicas (lock-in na primeira consulta, desconto rejeitado e não limitado, permissão de leitura do bill) ficam registradas no Gate de Plano de `ACTIVE_PLAN.md`/`QA_LEDGER.md`, não são decisões de arquitetura.

## 6. Perguntas abertas para o Victor
**Q6 respondida pelo Victor em 2026-09-10:** pagamento continua na maquininha de cartão física, fora do sistema; o ADMIN faz a baixa manual (registra pagamento) no sistema. Isso confirma o default já adotado (`PRODUCT_CONTEXT.md §2` Q6) — **sem integração de PSP/TEF no M13**, o M13 é só registro manual de pagamento pelo caixa/admin contra o ledger. Demais perguntas sem mudança — ver `PRODUCT_CONTEXT.md §2`.

## 7. Dependendo do Victor / pendências operacionais
- Reiniciar a máquina para tentar destravar o Docker Desktop (destravaria o Golden Journey completo com dados reais).
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).

## 8. Próximo passo exato
M12 implementado e testado localmente (lint/typecheck/unit/build verdes); falta abrir a PR, aguardar CI remota (integração Postgres) e mergear. Depois: planejar e executar o **M13 — sessão de caixa e pagamentos** (registro manual de pagamento contra o ledger, formas de pagamento, sem integração de PSP/TEF — confirmado pelo Victor, `PRODUCT_CONTEXT.md §2` Q6).
