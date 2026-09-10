# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.6/§4 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M15 (fechar comanda, divisão de conta, Golden Journey) está mergeado em `main` (commit `990dc83`, PR #24, CI verde de primeira). **Fase D completa.**

## Sem milestone ativo — aguardando decisão do Victor sobre a Fase E

A Fase D (M8–M15) fechou o ciclo operacional inteiro do restaurante, provado por um teste de Golden Journey real. O `ROADMAP.md` planeja a Fase E como:

- **M16 — Impressão térmica** (agente local + fila): depende de Q7 (`PRODUCT_CONTEXT.md §2` — a cozinha quer papel além do KDS? qual impressora?), informação exclusiva do restaurante.
- **M17 — Estoque, ficha técnica, CMV**: depende de dados reais de insumos/receitas do Bella III, que não existem no repositório ainda.
- **M18 — Backup/restore testado + runbook de incidentes**: técnico, não depende do Victor.
- **M19 — Relatórios avançados**: cabe aqui o que ficou faltando do M14 original (faturamento do dia, ticket médio, mais vendidos — ver `KNOWN_ISSUES.md` R-16); técnico, não depende do Victor, mas vale confirmar prioridade.
- **M20 — Degradação/reconexão endurecida e testes de caos**: técnico, não depende do Victor.

Regra 4 do `CLAUDE.md` (só parar por dúvida bloqueante, informação exclusiva do restaurante ou dependência externa comprovada) se aplica aqui: M16/M17 não dão pra planejar direito sem informação do Victor; M18/M19/M20 dariam, mas a ordem entre eles é uma escolha de prioridade de produto, não uma decisão técnica óbvia. Por isso a sessão parou no fim natural da Fase D em vez de escolher um desses cinco milestones sozinha.

**Quando o Victor decidir a prioridade:** reescrever este arquivo com o Gate de Plano do milestone escolhido e seguir o mesmo loop dos milestones anteriores.

---

## Histórico — M15 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`tab_closures` (fotografia final, `tab_id` único, migration `0012`); `POST /v1/tabs/:id/close` (permissão nova `tabs.close`) só fecha com saldo 0, idempotente por construção; `GET /v1/tabs/:id/split?parts=N` divide o saldo restante (`splitEvenly` do M0), puramente informativo. Golden Journey: um teste único prova o ciclo inteiro cliente→cozinha (KDS real)→salão→caixa→fechamento, ledger somando exatamente 0 ao final.

## Histórico — M14 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`cash_movements` (sangria/suprimento, `cash.movement`) e `cash_divergences` (schema novo, migration `0011`); `POST /v1/cash-sessions/:id/close` (`cash.close`) calcula `expected` por forma de pagamento sempre derivado de `payments`+`cash_movements` (nunca armazenado à parte), grava divergência só quando `counted ≠ expected` (nunca ajusta em silêncio), idempotente por reconstrução. Corrigidas 3 divergências reais entre `DOMAIN_MODEL.md` e o que já estava implementado desde o M13.

## Histórico — M13 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`cash_registers`/`cash_sessions`/`payments` (migration `0010`); abrir sessão de caixa (`cash.open`, uma por registrador via índice único); registrar pagamento (`payments.record`, nunca excede o saldo — `OVERPAYMENT` — reaproveitando `computeBill` do M12 dentro da MESMA transação para serializar concorrência real); estornar pagamento (`payments.void`, idempotente).
