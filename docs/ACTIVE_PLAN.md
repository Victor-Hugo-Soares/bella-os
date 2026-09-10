# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.6/§4 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M12 (ledger completo, taxas, couvert, descontos) está mergeado em `main` (commit `6fcb18e`, PR #21, CI verde). Este plano do M13 assume isso como ponto de partida: a comanda já sabe calcular seu próprio total (`GET /v1/tabs/:id/bill`); falta registrar dinheiro entrando de verdade.

## Milestone atual: **M13 — Sessão de caixa e pagamentos** (Fase D)

### Problema
Hoje a comanda sabe seu saldo (M12), mas não existe nenhuma forma de registrar que ela foi paga. `paid_total`/`balance` sempre veem 0/`grand_total` porque não há `payment` nenhum no ledger. Sem isso, nenhuma comanda jamais fecha.

### Confirmado pelo Victor (2026-09-10, `PRODUCT_CONTEXT.md §2` Q6)
O Bella III recebe pagamento na maquininha de cartão física, **fora do sistema**. O papel do Bella OS é só registrar (baixa manual) que a comanda foi paga, por qual forma, por quem. **Sem integração de PSP/TEF/gateway neste milestone nem depois** — isso simplifica bastante o M13: não há callback assíncrono de pagamento para tratar, o staff só informa o que já aconteceu na maquininha/dinheiro.

### Resultado esperado
1. **Schema novo** (migration): `cash_registers` (tenant_id, name, is_active — uma linha por caixa físico; Bella III só precisa de um, seed cria automaticamente), `cash_sessions` (tenant_id, cash_register_id, status `open/closed`, opened_by, opened_at, opening_float_cents — índice único parcial: um `open` por registradora, mesmo padrão do `table_sessions_open_per_table_key` do M6), `payments` (tenant_id, tab_id, cash_session_id, method `cash/debit/credit/pix/voucher/other`, amount_cents, tendered_cents?, change_cents?, status `confirmed/voided`, received_by_user_id, idempotency_key, voided_at, void_reason).
2. **`POST /v1/cash-sessions/open`** (`cash.open`): abre sessão no registrador do tenant com fundo de troco informado. Só uma sessão aberta por vez (constraint, não checagem em código).
3. **`GET /v1/cash-sessions/current`**: sessão aberta agora, se houver — qualquer staff (mesmo raciocínio do `GET /bill` no M12: leitura não é ação sensível).
4. **`POST /v1/tabs/:id/payments`** (`payments.record`, `Idempotency-Key` obrigatória — é dinheiro entrando, mesmo padrão de mutação crítica do M8): exige sessão de caixa aberta (`CASH_SESSION_CLOSED`, código já reservado desde o M0); `amountCents` nunca pode exceder o saldo atual (`OVERPAYMENT`, código também já reservado — reaproveitar, nunca inventar um novo). Cria `payments` (status `confirmed`) + `ledger_entries` (`payment`, negativo).
5. **`POST /v1/payments/:id/void`** (`payments.void`): estorna um pagamento errado — `ledger_entries` (`payment_void`, positivo). Idempotente por construção (já `voided` → devolve sem duplicar), mesmo padrão do cancelamento de item do M11.

### Fora de escopo (adiado conscientemente — não é esquecimento)
- **Fechar a sessão de caixa** (contagem por forma de pagamento, `expected`/`counted`, `cash_divergences`) é o **M14** — fechar exige toda a lógica de reconciliação, que é um problema à parte de verdade.
- **`cash_movements`** (sangria/suprimento/ajuste) também fica para o M14 — o `payments` deste milestone já carrega `cash_session_id`+`method`+`amount_cents`, suficiente para o M14 somar "esperado por forma" sem precisar de uma tabela de movimento redundante para vendas.
- **Fechar a comanda** (`tabs.status = 'closed'`, `tab_closures`) fica para o M14/M15 — este milestone só permite que o saldo chegue a 0; a ação explícita de fechar é do próximo.
- **CRUD de `cash_registers`**: seed cria um registrador único por tenant (igual ao padrão de `tenant_settings`); tela de administração de múltiplos caixas só se/quando um tenant real precisar de mais de um.

### Riscos
- **`amountCents` vs. `tenderedCents`/`changeCents`**: só dinheiro físico tem troco; cartão/PIX/voucher têm `tenderedCents == amountCents` sempre. Validar isso no contrato (zod `refine`), não deixar o cliente mandar troco em pagamento com cartão.
- **Overpayment por corrida**: dois pagamentos simultâneos na mesma comanda podem, juntos, ultrapassar o saldo mesmo que cada um isoladamente esteja OK. Mesmo padrão do M8 (`SELECT ... FOR UPDATE` na `tab` dentro da transação) resolve.

### Testes (3 frentes — CRÍTICO: dinheiro/caixa, regra 2)
1. Unit: nenhum novo cálculo puro necessário (reaproveita `totals.ts` do M12) — mas os `refine` do contrato de pagamento (troco só em dinheiro) ganham teste próprio em `packages/contracts`.
2. Integração (Postgres real, CI): abrir sessão → registrar pagamento parcial → saldo reduz corretamente (consulta independente ao ledger, mesmo padrão do M11/M12); pagamento que excede o saldo → `OVERPAYMENT`; estornar pagamento → saldo volta; dois pagamentos concorrentes que juntos excedem o saldo → só um vence.
3. Negativo/isolamento: pagamento sem `payments.record` → 403; pagamento sem sessão de caixa aberta → `CASH_SESSION_CLOSED`; comanda de outro tenant → 404.

### Gate de Plano (respondido no início da execução do M13)
1. **Schema novo em `packages/db/src/schema/billing.ts`** (nome do arquivo casa com o módulo da API do M12): `cashRegisters`, `cashSessions`, `payments`. RLS normal (ADR-021), sem exceção — nenhuma dessas tabelas precisa resolver identidade antes do tenant (diferente de `devices`/`guests`, ADR-025).
2. **Um registrador por tenant, provisionado no seed** — mesmo padrão de `tenant_settings` (uma linha sempre existe). Sem CRUD de `cash_registers` neste milestone (YAGNI: nenhum tenant real com mais de um caixa ainda).
3. **`cash_sessions` usa o mesmo padrão de índice único parcial** do `table_sessions_open_per_table_key` (M6): `uniqueIndex('cash_sessions_open_per_register_key').on(cashRegisterId).where(status <> 'closed')` — impossível abrir duas sessões na mesma registradora sob concorrência real, sem checagem em código.
4. **`payments.amountCents` nunca excede o saldo atual** — reaproveita `getBill()` do M12 dentro da mesma transação (`FOR UPDATE` na `tab`, mesmo padrão do M8/M12) para ler o saldo e decidir `OVERPAYMENT` antes de gravar. Código de erro `OVERPAYMENT`/`CASH_SESSION_CLOSED` já reservados desde o M0 — reaproveitados, não reinventados.
5. **Troco só existe em dinheiro:** contrato `createPaymentSchema` com `refine` — `method !== 'cash'` proíbe `tenderedCents`/`changeCents`; `method === 'cash'` exige `tenderedCents >= amountCents` e calcula `changeCents = tenderedCents - amountCents` no servidor (nunca confiar em `changeCents` vindo do corpo).
6. **`POST /v1/tabs/:id/payments` exige `Idempotency-Key`** (mesmo padrão do M8 `createOrder`, via `withIdempotency`) — é a primeira mutação de dinheiro ENTRANDO no sistema (diferente de `item_charge`, que é derivado do pedido); duplo-clique no botão "registrar pagamento" não pode criar dois pagamentos.
7. **`POST /v1/payments/:id/void` idempotente por construção** (mesmo padrão do `cancelOrderItem` do M11): já `voided` devolve sem duplicar o estorno.
8. **Escopo cortado conscientemente** (ver seção acima): fechamento de sessão com contagem/divergência (M14), `cash_movements` de sangria/suprimento (M14), fechar a comanda de fato (M14/M15).

### Frentes efetivamente cobertas nos testes de integração
`cash-sessions.test.ts` (abrir sessão, uma por registrador, índice único sob concorrência) e `payments.test.ts` (registrar pagamento parcial reduz saldo, overpayment rejeitado, estorno devolve saldo, dois pagamentos concorrentes que juntos excedem o saldo — só um vence, permissão positiva/negativa, isolamento cross-tenant).

## Próximos milestones (resumo; detalhes em `ROADMAP.md`)
M14 fechamento de caixa e relatórios → M15 divisão de conta e Golden Journey completa (fim da Fase D).
