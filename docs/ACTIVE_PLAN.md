# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.5/§1.6/§2.5/§2.9 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M10 (acompanhamento, chamados, expedição) está mergeado em `main` (commit `95103fe`, PR #17, CI verde: 80/80 testes). Este plano do M11 assume isso como ponto de partida — **último milestone da Fase C**.

## Milestone atual: **M11 — Cancelamentos e pedido pela equipe** (fecha a Fase C)

### Problema
Hoje um item errado ou um cliente que desiste não tem como ser cancelado — o pedido existe para sempre como foi criado. E um garçom que precisa lançar um pedido em nome de uma mesa (cliente sem celular, pedido complementar) só tem a API (M8), nenhuma tela.

### Escopo desta fatia (corte registrado)
**Transferência/junção de mesa (`table_session_transfers`) fica FORA deste milestone**, mesmo o `ROADMAP.md` original listando no M11. Motivo: é um problema à parte de verdade (concorrência real — pedido chegando durante a transferência precisa cair na comanda certa, exige seu próprio teste de corrida) e não bloqueia nem cancelamento nem pedido pela equipe, que já são dois pedaços substanciais. Fica reservado para quando a operação real do Bella III mostrar que é necessário (mesas raramente precisam ser fundidas no dia a dia — cancelamento e pedido pela equipe são muito mais comuns).

### Resultado esperado
1. **Cancelar item antes da produção** (`orders.cancel.before_production`): item em `queued` → `cancelled`, reversão total no ledger (`item_reversal`), ticket atualizado (some da lista se for o único item, ou o ticket permanece para os itens restantes).
2. **Cancelar item depois da produção** (`orders.cancel.after_production`): item em `preparing`/`ready`/`delivered` → `cancelled`, exige motivo + decisão `charge_on_cancel` (cliente paga = sem reversão; cortesia/perda = `item_reversal`).
3. **Alerta no KDS**: ticket com item cancelado mostra destaque visual "CANCELADO".
4. **Pedido pela equipe** (tela nova, `apps/web`): garçom/caixa autenticado escolhe uma mesa/comanda aberta e monta um pedido — consome a MESMA `POST /v1/orders` do M8 (`source: 'staff'`), só faltava a tela.

### Arquivos envolvidos
- `apps/api/src/modules/orders/service.ts`: `cancelOrderItem()`.
- `apps/api/src/modules/orders/routes.ts`: `PATCH /v1/orders/:orderId/items/:itemId/cancel` (staff) — cliente não cancela o próprio item neste milestone (sempre passa pelo staff, mais simples e mais seguro para dinheiro).
- `apps/web/src/app/(kds)/kds/page.tsx`: destaque de item cancelado.
- `apps/web/src/app/(admin)/admin/staff-order/**` (novo, nome a definir no início): tela de pedido pela equipe.
- Testes: `apps/api/test/integration/cancel-order.test.ts`.

### Riscos
- **`charge_on_cancel` errado é dinheiro perdido de verdade** — mesmo não sendo um novo tipo de milestone crítico isolado, esta parte específica (reversão de ledger) precisa da mesma disciplina do M8: preço sempre reconstruído do item, nunca aceito do corpo da requisição.
- **Cancelar depois de `delivered`** (`DOMAIN_MODEL.md §2.5`: "só gerente, sempre com motivo, tratado como estorno") — decisão: incluído na mesma regra de "depois da produção" (mesma permissão, mesmo fluxo), sem uma permissão extra só para isso neste milestone — revisitar se a operação real mostrar que precisa diferenciar.

### Testes (3 frentes — CRÍTICO: regra 2 do CLAUDE.md lista "cancelamento" explicitamente)
1. Cancelar antes da produção: reversão total no ledger, consulta independente confirma saldo da comanda voltou ao que era antes do item.
2. Cancelar depois da produção com `charge_on_cancel=true` (cliente paga): SEM reversão — ledger continua cobrando; com `charge_on_cancel=false` (cortesia): COM reversão.
3. Negativo: sem `orders.cancel.before_production`/`orders.cancel.after_production` → 403; cancelar item de outro tenant → 404 (nunca vaza).

### Critérios de aceite
- [ ] Cancelamento antes/depois da produção funciona com ledger correto nos dois casos.
- [ ] KDS mostra alerta visual em ticket com item cancelado.
- [ ] Garçom consegue lançar pedido pela tela, não só pela API.
- [ ] `pnpm check`/`pnpm build` verdes; CI remota verde.
- [ ] Docs atualizados; `ACTIVE_PLAN.md` reescrito para M12 (início da Fase D: ledger, taxas, couvert, descontos).

### Gate de Plano (respondido em 2026-09-10)
Problema entendido (cancelamento é operação do dia a dia; pedido pela equipe já tem API, só falta tela) · solução menor não existiria (dinheiro real muda de mãos) · risco principal é ACERTAR o ledger dos dois tipos de cancelamento (regra 2: crítico, 3 frentes) · corte de escopo registrado (transferência de mesa fica para depois, problema à parte) · prova por integração real + consulta independente ao ledger · rollback trivial (rota nova) · multi-tenant preservado (RLS normal em tudo).

## Próximos milestones (resumo; detalhes em `ROADMAP.md`)
**Fim da Fase C.** Fase D: M12 ledger completo (taxas, couvert, descontos) → M13 sessão de caixa e pagamentos → M14 fechamento de caixa e relatórios → M15 divisão de conta e Golden Journey completa.
