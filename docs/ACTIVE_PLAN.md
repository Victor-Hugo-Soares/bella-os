# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.6/§4 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M13 (sessão de caixa, pagamentos) está mergeado em `main` (commit `0c600fe`, PR #22, CI verde — 11 testes de integração novos, 1 regressão de teste pega pela própria CI e corrigida antes do merge). Este plano do M14 assume isso como ponto de partida: dá para abrir caixa e registrar pagamento contra a comanda; falta fechar o turno com contagem e ver o resumo do dia.

## Milestone atual: **M14 — Fechamento de caixa e relatórios** (Fase D)

### Problema
Hoje uma sessão de caixa aberta (M13) nunca fecha — não existe `POST /v1/cash-sessions/:id/close`, nem `cash_movements` (sangria/suprimento), nem `cash_divergences`. Sem isso, o caixa físico do Bella III não consegue bater o dia: ninguém sabe "quanto deveria ter em cada forma de pagamento" nem registra a diferença quando o contado não bate.

### Resultado esperado
1. **Schema novo**: `cash_movements` (cash_session_id, type `withdrawal(sangria)/deposit(suprimento)/adjustment`, method, amount_cents, reason, by — **sem** tipo `sale`: vendas já estão em `payments`, reaproveitar em vez de duplicar, decisão do Gate de Plano do M13 #8) e `cash_divergences` (cash_session_id, method, expected_cents, counted_cents, difference_cents, reason, acknowledged_by).
2. **`POST /v1/cash-sessions/:id/movements`** (`cash.movement`): sangria ou suprimento, motivo obrigatório.
3. **`POST /v1/cash-sessions/:id/close`** (`cash.close`): recebe `counted` (contado por forma de pagamento, informado pelo operador); servidor calcula `expected` por forma (soma de `payments` confirmados da sessão, por `method`, + `opening_float_cents` no caso `cash` + movimentos de `cash_movements`); grava `cash_divergences` para toda forma onde `counted ≠ expected` — **nunca ajusta em silêncio** (`DOMAIN_MODEL.md §1.6`, princípio 3 de `PRODUCT_CONTEXT.md §6`); marca sessão `closed`.
4. **Resumo do turno**: o próprio `close` (ou um `GET /v1/cash-sessions/:id/summary`) devolve o detalhamento — vendas por forma, sangrias/suprimentos, divergências — não só "fechado com sucesso".

### Riscos
- **Sessão fechada não pode aceitar pagamento novo depois** — `payments.record`/`cash_movements` devem checar `cash_session.status = 'open'` (mesmo tipo de proteção que `TAB_CLOSED` já dá para comanda fechada); código de erro `CASH_SESSION_CLOSED` já existe, reaproveitar.
- **Cálculo de `expected` errado é pior que não calcular** — cada forma de pagamento soma independentemente (nunca um total único "geral"); testar com múltiplas formas na mesma sessão.

### Testes (3 frentes — CRÍTICO: dinheiro/caixa, regra 2)
1. Fechar sessão com contado batendo o esperado → nenhuma `cash_divergences` gravada.
2. Fechar com divergência → `cash_divergences` gravada com o valor exato da diferença, sessão fecha mesmo assim (divergência é registrada, não bloqueia o fechamento).
3. Sangria/suprimento entra na conta do `expected`; pagamento após a sessão fechada → `CASH_SESSION_CLOSED`; negativo de permissão (`cash.close`/`cash.movement`).

### Gate de Plano (respondido no início da execução do M14)
1. **Schema novo em `packages/db/src/schema/billing.ts`** (mesmo arquivo do M13): `cashMovements` (`type` em `withdrawal/deposit/adjustment` — `adjustment` reservado no `CHECK` mas **não exposto pela API neste milestone**, YAGNI: sem caso de uso real ainda; a API só aceita `withdrawal`/`deposit`), `cashDivergences` (`reason` nullable, reservado para quando existir uma tela de "reconhecer divergência" — não setável pela API do M14).
2. **`expected` por forma de pagamento é derivado, nunca armazenado separadamente**: soma de `payments` confirmados da sessão por `method` + `opening_float_cents` (só em `cash`) + `cash_movements` (`deposit` soma, `withdrawal` subtrai). Calculado sob demanda em `closeCashSession`, não em uma tabela de cache — a mesma fonte de verdade (`payments`) que o M13 já decidiu não duplicar.
3. **`POST /close` é idempotente por reconstrução, não por bloqueio**: depois que a sessão fecha, `payments`/`cash_movements` não podem mais mudar (ambos checam `status === 'open'` antes de gravar, mesmo padrão `CASH_SESSION_CLOSED`), então recalcular `expected`/`counted`/divergência numa sessão já fechada sempre dá a mesma resposta — uma segunda chamada a `close` só NÃO insere `cash_divergences` de novo (checagem de `session.status` antes do insert), mas devolve o mesmo resumo.
4. **Divergência é sempre registrada quando `counted ≠ expected`, nunca ajustada** (`PRODUCT_CONTEXT.md §6`, princípio 3) — inclusive método com atividade esperada que o operador esqueceu de contar (`counted` ausente no corpo = 0, e isso vira divergência visível, não um erro nem um valor escondido).
5. **`recordCashMovement`/`closeCashSession` recebem `:id` da sessão de caixa na URL** (não "a sessão atual") — mesma forma de outras rotas que operam sobre um recurso específico; a rota valida que aquela sessão pertence ao tenant e está `open` antes de qualquer escrita.

## Próximos milestones (resumo; detalhes em `ROADMAP.md`)
M15 divisão de conta e Golden Journey completa (fim da Fase D).

---

## Histórico — M13 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`cash_registers`/`cash_sessions`/`payments` (migration `0010`); abrir sessão de caixa (`cash.open`, uma por registrador via índice único); registrar pagamento (`payments.record`, nunca excede o saldo — `OVERPAYMENT` — reaproveitando `computeBill` do M12 dentro da MESMA transação para serializar concorrência real); estornar pagamento (`payments.void`, idempotente). Cortes conscientes para o M14: fechar sessão (contagem/divergência), `cash_movements` (sangria/suprimento), fechar a comanda de fato.
