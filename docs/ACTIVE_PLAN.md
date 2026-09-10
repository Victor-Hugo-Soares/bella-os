# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.6/§4 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M11 (cancelamentos, pedido pela equipe) está mergeado em `main` (commit `2a2ecaf`, PR #19, CI verde: 87/87 testes). **Fase C completa.** Este plano do M12 assume isso como ponto de partida — primeiro milestone da Fase D (caixa e financeiro).

## Milestone atual: **M12 — Ledger, taxas, couvert, descontos** (Fase D)

### Problema
O ledger hoje só sabe lançar `item_charge`/`item_reversal` (M8/M11). Não existe taxa de serviço, couvert, nem desconto — e não existe uma forma de perguntar "quanto essa comanda deve no total, agora?" (`DOMAIN_MODEL.md §4` já define a fórmula, mas nada a calcula de verdade ainda). Sem isso, o M13 (pagamento) não tem contra o que registrar.

### Pendência de produto (não bloqueante para começar, mas relevante antes de terminar)
O Victor ainda não confirmou como o caixa físico do Bella III opera hoje. `tenant_settings` (M1) já tem os campos certos com defaults razoáveis (`service_fee_mode: optional`, `service_fee_bps: 1000`, `couvert_mode: off`) — a fatia do M12 usa esses defaults e não trava por falta de resposta, mas vale confirmar com ele antes do M13 (pagamento) se o Bella III realmente cobra os 10% e se tem couvert.

### Resultado esperado
1. **`packages/domain/src/totals.ts`** (novo, função pura): implementa a fórmula do `DOMAIN_MODEL.md §4` — `items_total`, `discounts`, `service_fee` (`round_half_even`), `couvert`, `grand_total`, `paid_total` (0 por enquanto, pagamento é M13), `balance`. Testada isoladamente (unit, sem banco) com a tabela de casos de centavos exigida pela regra 2 do CLAUDE.md para dinheiro.
2. **`GET /v1/tabs/:id/bill`**: reconstrói o total da comanda a partir do ledger + `tenant_settings`, devolve o detalhamento (não só o número final).
3. **Lançar taxa de serviço/couvert**: acontece automaticamente quando a comanda é consultada/fechada (não é uma ação manual do garçom) — calculado a partir de `tenant_settings`, gravado como `ledger_entries` (`service_fee`, `couvert`) na primeira vez que a conta é pedida (idempotente: não duplica se `GET /bill` for chamado de novo).
4. **Desconto manual** (`discounts.apply`): `POST /v1/tabs/:id/discounts` — percentual ou fixo, motivo obrigatório, só com permissão; materializa em `ledger_entries` (`discount`).

### Riscos
- **Arredondamento é onde dinheiro se perde silenciosamente** — `round_half_even` já existe em `@bella/domain/money.ts` desde o M0, reaproveitar, nunca reimplementar.
- **Idempotência do lançamento automático de taxa/couvert**: `GET /bill` não pode ser uma ação livre de efeito colateral que gera lançamento novo a cada chamada — verificar se já existe lançamento do tipo antes de criar.

### Testes (3 frentes — CRÍTICO: dinheiro, regra 2)
1. Tabela de casos de centavos para `service_fee`/`couvert`/`discount` (unit, `packages/domain`).
2. Integração: `GET /bill` chamado duas vezes não duplica taxa/couvert; total reconstruído bate com soma manual do ledger (consulta independente).
3. Negativo: desconto sem `discounts.apply` → 403; desconto maior que o total → rejeitado ou limitado a zero (decisão a registrar).

### Gate de Plano (respondido no início da execução do M12)
1. **Confirmação do Victor (2026-09-10):** pagamento continua na maquininha física, fora do sistema; ADMIN dá baixa manual. Não muda nada do M12 (que não mexe em pagamento), só remove a pendência antes do M13 (ver `PRODUCT_CONTEXT.md §2` Q6, `PROJECT_STATE.md §6`).
2. **`packages/domain/src/totals.ts` é puro de verdade:** recebe os componentes já somados (`itemsTotalCents`, `discountsCents`, `serviceFeeCents`, `couvertCents`, `adjustmentsCents`, `paidTotalCents`) e só faz a aritmética do `DOMAIN_MODEL.md §4`; quem soma o ledger é o serviço da API. Funções auxiliares puras separadas para calcular o valor a lançar (`computeServiceFeeCents`, reaproveitando `applyBps`; `computeCouvertCents` por modo).
3. **`items_total` reconstruído do ledger, não da tabela `order_items`:** soma de `item_charge` + `item_reversal` (já sinalizados) cobre o efeito de cancelamentos com e sem cobrança sem duplicar a regra do M11 — mesmo princípio de "consulta independente ao ledger" usado nos testes do M11.
4. **Lançamento automático de taxa/couvert é travado na primeira consulta e nunca recalculado depois** (é exatamente o que o plano original pede: "grava na primeira vez que a conta é pedida"). Concorrência: `SELECT ... FOR UPDATE` na `tab` (mesmo padrão do M8) + checagem de existência na mesma transação antes de inserir — duas chamadas simultâneas a `GET /bill` na mesma comanda nunca duplicam o lançamento.
5. **Desconto maior que o saldo atual de itens é REJEITADO** (`VALIDATION_ERROR`), nunca limitado a zero em silêncio — consistente com o princípio 3 de `PRODUCT_CONTEXT.md §6` ("nada silencioso"). Desconto percentual é calculado em bps (`applyBps`) sobre o total de itens líquido de descontos já aplicados (não sobre o total original, para não empilhar desconto sobre desconto já descontado).
6. **Permissão de `GET /v1/tabs/:id/bill`:** nenhuma chave de `discounts`/`payments` cabe aqui (é leitura, não mutação sensível) e restringir a `tables.manage` excluiria o `cashier` (que não tem essa chave, mas precisa ver a conta para fechar comanda). Decisão: qualquer sessão de staff autenticada no tenant (`requireAnySession`) pode ler o `bill` — mesmo padrão de `GET /v1/me/tenants` (ADR-030), que também não é uma ação de negócio sensível. `POST /discounts` continua exigindo `discounts.apply`.

## Próximos milestones (resumo; detalhes em `ROADMAP.md`)
M13 sessão de caixa e pagamentos → M14 fechamento de caixa e relatórios → M15 divisão de conta e Golden Journey completa (fim da Fase D).
