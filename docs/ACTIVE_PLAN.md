# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.6/§4 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M15 (fechar comanda, divisão de conta, Golden Journey) está mergeado em `main` (commit `990dc83`, PR #24, CI verde de primeira). **Fase D completa.** Victor confirmou em 2026-09-10: cozinha por enquanto é só tela (Q7) — M16 "Impressão" do `ROADMAP.md` fica sem data, slot reaproveitado. Ordem escolhida por ele para a Fase E: relatório do dia → backup/restore → resiliência de conexão.

## Milestone atual: **M16 — Relatório do dia operacional** (Fase E, reaproveitando o slot da impressão)

### Problema
O M14 original (`ROADMAP.md`) previa "relatório do dia operacional (faturamento, ticket médio, mais vendidos, cancelamentos/descontos por operador)" e isso nunca foi entregue (`KNOWN_ISSUES.md` R-16). Toda a base de dados já existe (`order_items`, `order_events`, `ledger_entries`) — falta só a consulta.

### Resultado esperado
1. **`GET /v1/reports/daily?from=<ISO>&to=<ISO>`** (`reports.view`, permissão já existente desde o M2): faturamento (soma de `line_total_cents` de itens não cancelados ou cancelados com `charge_on_cancel`, por `orders.submitted_at` no intervalo), ticket médio (faturamento ÷ número de comandas distintas com pedido no intervalo), mais vendidos (top produtos por receita e quantidade), cancelamentos por operador (agrupado de `order_events` tipo `item.cancelled`), descontos por operador (agrupado de `ledger_entries` tipo `discount`).
2. Nomes de operador resolvidos via `users` (tabela global, sem RLS — consulta direta dentro da mesma transação).

### Riscos
- **"Dia operacional" com virada às 05:00 (`tenant_settings.business_day_cutoff`, Q9) exigiria matemática de fuso horário correta** — sem biblioteca de timezone no projeto hoje, implementar isso à mão é risco real de bug silencioso num relatório financeiro. Decisão: `from`/`to` são timestamps ISO explícitos (quem chama decide o intervalo), não um cálculo automático de "hoje" no fuso do tenant. Vira dívida consciente, igual o próprio comentário do M8 já previa ("entra quando um relatório diário real precisar disso") — a hora certa de resolver isso é quando existir uma TELA real de relatório, com biblioteca de timezone testada, não agora só pela API.
- **Contagem duplicada de operador**: um mesmo usuário pode ter várias entradas no período — agrupar sempre por `userId`, nunca assumir 1 evento = 1 operador único no dia.

### Testes (2 frentes — normal, não críticas: é leitura, não mutação de dinheiro)
1. Integração: comanda com item cancelado (`charge_on_cancel=false`) não conta no faturamento; comanda com `charge_on_cancel=true` conta; desconto aplicado aparece agrupado no operador certo; cancelamento aparece agrupado no operador certo; ticket médio bate com cálculo manual.
2. Negativo: sem `reports.view` → 403; isolamento cross-tenant (dados de outro tenant nunca aparecem).

### Gate de Plano (respondido no início da execução do M16)
1. **Nenhuma tabela nova, nenhuma migration** — é só consulta sobre dados já existentes.
2. **Sem cálculo automático de "dia operacional"** (ver Riscos) — `from`/`to` explícitos no query string, validados com `z.iso.datetime()` (já usado em `health.ts`).
3. **Faturamento usa a mesma regra de `items_total` do `computeBill`** (M12): item conta se não cancelado OU cancelado com `charge_on_cancel=true` — nunca reimplementar essa regra do zero, replicar exatamente.
4. **Permissão: `reports.view`**, já existe desde o M2 (`owner`/`manager`/`cashier` têm; `waiter`/`kitchen` não) — nenhuma chave nova necessária.
5. **Agrupamento por operador feito em JavaScript, não em SQL**: `actor`/`created_by` são `jsonb`, e o volume de eventos por dia de um restaurante é pequeno o bastante para não justificar `GROUP BY` em JSON no Postgres — mesmo padrão de "buscar linhas e reduzir em código" já usado em `sumLedgerByTypes` (M12).

---

## Histórico — M15 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`tab_closures` (fotografia final, `tab_id` único, migration `0012`); `POST /v1/tabs/:id/close` (permissão nova `tabs.close`) só fecha com saldo 0, idempotente por construção; `GET /v1/tabs/:id/split?parts=N` divide o saldo restante (`splitEvenly` do M0), puramente informativo. Golden Journey: um teste único prova o ciclo inteiro cliente→cozinha (KDS real)→salão→caixa→fechamento, ledger somando exatamente 0 ao final.

## Histórico — M14 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`cash_movements` (sangria/suprimento, `cash.movement`) e `cash_divergences` (schema novo, migration `0011`); `POST /v1/cash-sessions/:id/close` (`cash.close`) calcula `expected` por forma de pagamento sempre derivado de `payments`+`cash_movements` (nunca armazenado à parte), grava divergência só quando `counted ≠ expected` (nunca ajusta em silêncio), idempotente por reconstrução. Corrigidas 3 divergências reais entre `DOMAIN_MODEL.md` e o que já estava implementado desde o M13.

## Histórico — M13 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`cash_registers`/`cash_sessions`/`payments` (migration `0010`); abrir sessão de caixa (`cash.open`, uma por registrador via índice único); registrar pagamento (`payments.record`, nunca excede o saldo — `OVERPAYMENT` — reaproveitando `computeBill` do M12 dentro da MESMA transação para serializar concorrência real); estornar pagamento (`payments.void`, idempotente).
