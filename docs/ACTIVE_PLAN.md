# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.6/§4 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M14 (fechamento de caixa, sangria/suprimento) está mergeado em `main` (commit `ba7c790`, PR #23, CI verde — 5 testes de integração novos, 1 regressão de teste pega pela própria CI e corrigida antes do merge). Este plano do M15 assume isso como ponto de partida: a comanda chega a saldo 0, o caixa fecha o turno — falta fechar a comanda de fato e dividir a conta. **Último milestone da Fase D.**

## Milestone atual: **M15 — Divisão de conta e Golden Journey completa** (fecha a Fase D)

### Problema
Duas lacunas fecham a Fase D: (1) o saldo da comanda pode chegar a 0 (M13), mas `tabs.status` nunca vira `closed` — nada fotografa o resultado final nem impede novo pedido numa comanda "paga"; (2) não existe forma de sugerir como dividir a conta entre os clientes de uma mesa (`DOMAIN_MODEL.md §4` já reserva `split(total, n)`, nunca implementado). Sem os dois, o Golden Journey (cliente pede → cozinha prepara → cliente acompanha → equipe cobra → caixa fecha) nunca fecha de ponta a ponta.

### Resultado esperado
1. **`tab_closures`** (schema novo, migration): fotografia final da comanda no momento do fechamento (`items_total`, `service_fee`, `couvert`, `discounts`, `adjustments`, `grand_total`, `paid_total`, `closed_by`, `closed_at`) — `tab_id` único, nunca duas fotografias para a mesma comanda.
2. **`POST /v1/tabs/:id/close`**: só fecha com `balance = 0` (reaproveita `computeBill`); grava `tab_closures` e marca `tabs.status = 'closed'`; comanda fechada nunca mais aceita pedido novo (`createOrder` já valida `tab.status === 'open'` desde o M8 — conferir que continua valendo) nem pagamento novo.
3. **`GET /v1/tabs/:id/split?parts=N`**: sugestão de divisão igual entre N pessoas — `splitEvenly()` de `@bella/domain` (já existe desde o M0, reaproveitar), puramente informativo, não muda nada no banco. Divisão por item/pessoa fica fora do MVP (`PRODUCT_CONTEXT.md §2` Q1: "divisão por item/pessoa opcional", sem tela ainda que precise disso de verdade).
4. **Golden Journey**: um teste de integração que percorre o ciclo inteiro numa única comanda — cliente escaneia QR, pede, cozinha prepara e entrega (via KDS real), cliente acompanha e pede a conta, equipe consulta o `bill`, aplica desconto, cliente é cobrado (pagamento), caixa fecha a sessão, comanda fecha — prova que os 15 milestones realmente compõem um sistema, não só módulos isolados que passam nos próprios testes.

### Riscos
- **Fechar comanda com saldo ≠ 0 por engano** é o pior erro possível aqui (perder o controle de quanto falta cobrar) — validação sempre no servidor, nunca confiar em "o cliente disse que pagou".
- **`GET /split` é só sugestão** — nunca grava nada; se o valor sugerido não bate com o que o caixa realmente cobra depois (multi-forma, alguém paga mais), isso é normal e esperado, não um bug.

### Testes (3 frentes — CRÍTICO: dinheiro/comanda, regra 2)
1. Unit: `splitEvenly` já testado desde o M0 (reaproveitado, sem teste novo necessário) — só o endpoint de split precisa de um teste de integração leve confirmando que soma das parcelas == grand_total.
2. Integração: fechar comanda com saldo 0 → `tabs.status = 'closed'` + `tab_closures` gravada; fechar com saldo ≠ 0 → rejeitado, nada gravado; comanda fechada rejeita pedido novo e pagamento novo.
3. Golden Journey: teste de integração único, ponta a ponta, cobrindo cliente→cozinha→salão→caixa→fechamento numa mesma comanda.

### Gate de Plano (respondido no início da execução do M15)
1. **`tab_closures` no mesmo `packages/db/src/schema/billing.ts`** (financeiro, DOMAIN_MODEL.md §1.6) — `tab_id` único (nunca duas fotografias da mesma comanda), campos exatamente os já calculados por `computeBill` (nada novo a inventar).
2. **`POST /v1/tabs/:id/close` é idempotente por construção**: se a comanda já está `closed`, devolve a `tab_closures` já gravada (mesmo padrão do M11/M13) em vez de erro — nunca duas fotografias para a mesma comanda. Se `balance ≠ 0`, rejeita com `CONFLICT` (409) — fechar com saldo pendente é o pior erro possível aqui (regra 2 do CLAUDE.md, "comanda" listada explicitamente).
3. **Permissão de fechar comanda**: `payments.record` não cobre (é sobre registrar dinheiro entrando, não sobre fechar); decisão: reaproveitar `discounts.apply`? Não — nenhuma chave existente encaixa semanticamente. Nova chave **`tabs.close`** em `packages/domain/src/permissions.ts`, concedida a `owner`/`manager`/`cashier` (mesmo conjunto de `payments.record`) — é a primeira permissão nova desde o M2, mas "fechar comanda" é uma ação de negócio distinta o bastante (M11/M12/M13/M14 sempre couberam em chaves já existentes; esta não cabe).
4. **`GET /v1/tabs/:id/split?parts=N` divide o SALDO restante** (`balanceCents`), não o `grandTotal` original — é "quanto cada um ainda precisa pagar agora", útil mesmo se já houve pagamento parcial. Puramente informativo (`splitEvenly` de `@bella/domain`, já existe desde o M0), nunca grava nada. Leitura por qualquer staff (`requireAnySession`, mesmo raciocínio do `GET /bill`).
5. **Golden Journey usa o tenant `bella`**, com o MESMO cuidado defensivo do M14 (`cash-close.test.ts`): fecha qualquer sessão de caixa aberta residual de outros arquivos de teste antes de começar, nunca assume um registrador livre só porque "deveria" estar.
6. **Divisão por item/pessoa fica fora do MVP** (confirmado: `PRODUCT_CONTEXT.md §2` Q1 já tem esse default desde o bootstrap) — sem tela real que precise disso ainda.

---

## Histórico — M14 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`cash_movements` (sangria/suprimento, `cash.movement`) e `cash_divergences` (schema novo, migration `0011`); `POST /v1/cash-sessions/:id/close` (`cash.close`) calcula `expected` por forma de pagamento sempre derivado de `payments`+`cash_movements` (nunca armazenado à parte), grava divergência só quando `counted ≠ expected` (nunca ajusta em silêncio), idempotente por reconstrução. Corrigidas 3 divergências reais entre `DOMAIN_MODEL.md` e o que já estava implementado desde o M13.

## Histórico — M13 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`cash_registers`/`cash_sessions`/`payments` (migration `0010`); abrir sessão de caixa (`cash.open`, uma por registrador via índice único); registrar pagamento (`payments.record`, nunca excede o saldo — `OVERPAYMENT` — reaproveitando `computeBill` do M12 dentro da MESMA transação para serializar concorrência real); estornar pagamento (`payments.void`, idempotente).
