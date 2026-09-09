# Bella OS — Modelo de Domínio, Estados e Concorrência

> Referência para modelagem do banco e das regras. Toda tabela de negócio tem `id uuid` (v7), `tenant_id uuid NOT NULL`, `created_at timestamptz`, `updated_at timestamptz`. Valores monetários são `bigint` em centavos. Nomes de tabela em `snake_case` plural. Enum de status em `text` com `CHECK` (fácil de migrar) — não `enum` nativo.

## 1. Entidades por domínio

### 1.1 Plataforma e tenant
| Tabela | Campos-chave | Notas |
|--------|--------------|-------|
| `organizations` | name | opcional; agrupa tenants (rede) para relatório consolidado futuro |
| `tenants` | slug (unique), name, organization_id?, timezone (`America/Sao_Paulo`), status (`active/suspended`) | um tenant = uma unidade |
| `tenant_settings` | tenant_id (PK), colunas tipadas: `service_fee_bps` (1000 = 10%), `service_fee_mode` (`off/optional/mandatory`), `couvert_cents`, `couvert_mode` (`off/per_guest/per_tab`), `customer_order_mode` (`direct/confirm_first_order/confirm_all`), `half_half_pricing` (`highest/average`), `business_day_cutoff` (time, 05:00), `customer_can_request_bill` bool, `unverified_session_max_cents`, `brand` JSONB (cores, logo) | tipado > JSONB genérico; JSONB só para tema |
| `platform_admins` | user_id | superadmin, separado de membership |

### 1.2 Identidade
| Tabela | Campos-chave | Notas |
|--------|--------------|-------|
| `users` | email (unique), name, password_hash, status | gerenciada por Better Auth (+ colunas próprias) |
| `auth_sessions`, `auth_accounts`, `auth_verifications` | — | tabelas do Better Auth |
| `roles` | tenant_id, name, is_system | seed: owner, manager, cashier, waiter, kitchen |
| `role_permissions` | role_id, permission_key | chaves fixas em `packages/domain/permissions.ts` |
| `memberships` | user_id, tenant_id, role_id, pin_hash?, pin_failed_attempts, pin_locked_until, status | UNIQUE (user_id, tenant_id) |
| `devices` | tenant_id, name, kind (`kds/cashier/floor/admin`), token_hash, station_ids[], cash_register_id?, last_seen_at, revoked_at | pareado por código de 6 dígitos gerado pelo gerente |
| `pairing_codes` | tenant_id, code, expires_at, used_at, device_kind | TTL 10 min |

### 1.3 Catálogo
| Tabela | Campos-chave | Notas |
|--------|--------------|-------|
| `stations` | tenant_id, name, kind (`kitchen/pizza/bar/other`), sort_order, is_active | destino de produção |
| `categories` | tenant_id, name, sort_order, is_active, visible_from/visible_to (time)? | horário opcional (pós-MVP) |
| `products` | tenant_id, category_id, station_id, name, description, base_price_cents, kind (`simple/pizza`), is_active, is_available (esgotado = false), prep_time_minutes, image_id?, sort_order, allergens[] , note_presets text[] | `is_available` mudado pelo KDS |
| `modifier_groups` | tenant_id, name, min_select, max_select, pricing_mode (`delta/absolute`), sort_order | "Tamanho" = min 1 max 1 absolute; "Adicionais" = min 0 max n delta |
| `modifiers` | group_id, name, price_cents, is_available, sort_order | preço delta ou absoluto conforme grupo |
| `product_modifier_groups` | product_id, group_id, sort_order | N:N |
| `pizza_flavor_groups`? | — | meio a meio: produto `kind=pizza` referencia grupo de sabores; item guarda `components` |
| `product_images` | tenant_id, product_id, storage_key, variants JSONB (thumb/card/full), is_primary, source (`upload/ai`), parent_image_id? | IA gera nova versão, nunca sobrescreve |

### 1.4 Mesas e comandas
| Tabela | Campos-chave | Notas |
|--------|--------------|-------|
| `areas` | tenant_id, name, sort_order | salão, varanda |
| `tables` | tenant_id, area_id?, number/label, seats, qr_code (unique por tenant, curto e não sequencial), is_active | QR fixo impresso |
| `table_sessions` | tenant_id, table_id, status (`open/closing/closed`), opened_at, closed_at, opened_by (`customer/staff`), opened_by_user_id?, verified_at?, verified_by?, guest_count? , closed_reason | **índice único parcial**: `(table_id) WHERE status <> 'closed'` |
| `tabs` (comandas) | tenant_id, table_session_id, label ("Mesa 12", "João"), status (`open/closed`), closed_at, closed_by | 1..n por sessão; padrão 1 |
| `guests` | tenant_id, table_session_id, tab_id?, display_name?, device_fingerprint?, token_hash | um por celular que entrou; permite "quem pediu o quê" |
| `service_requests` | tenant_id, table_session_id, kind (`call_waiter/request_bill/other`), note?, status (`open/acknowledged/done`), created_by_guest_id?, handled_by? | chamados |
| `table_session_transfers` | from_table_id, to_table_id, session_id, by, reason | auditoria de transferência; junção de mesas = mover tabs para outra sessão |

### 1.5 Pedidos e produção
| Tabela | Campos-chave | Notas |
|--------|--------------|-------|
| `orders` | tenant_id, tab_id, table_session_id, sequence_number (por tenant por dia operacional), source (`customer/staff/delivery`), status, placed_by_guest_id?, placed_by_user_id?, idempotency_key, notes, submitted_at, accepted_at, cancelled_at | status derivado dos itens, materializado |
| `order_items` | order_id, product_id, station_id, name_snapshot, unit_price_cents, quantity, modifiers_total_cents, line_total_cents, notes, status, selections JSONB (snapshot legível), components JSONB (meio a meio), cancelled_at, cancel_reason, cancel_stage (`before_production/after_production`), charge_on_cancel bool, ticket_id | preço sempre snapshot |
| `order_item_modifiers` | order_item_id, modifier_id, name_snapshot, price_cents | normalizado para relatório |
| `production_tickets` | tenant_id, order_id, station_id, status, queued_at, started_at, ready_at, delivered_at, estimated_ready_at, bumped_by_device_id, recall_count, priority | um ticket por (pedido, estação) |
| `order_events` | order_id, order_item_id?, type, from_status, to_status, actor (json), at | histórico imutável |

### 1.6 Financeiro
| Tabela | Campos-chave | Notas |
|--------|--------------|-------|
| `ledger_entries` | tenant_id, tab_id, type (`item_charge/item_reversal/service_fee/couvert/discount/payment/payment_void/adjustment/transfer_in/transfer_out`), amount_cents (signed: cobranças +, pagamentos −), ref_type/ref_id, reason?, created_by (actor), cash_session_id? | **append-only**: sem UPDATE/DELETE (revogar privilégio + trigger) |
| `payments` | tenant_id, tab_id, cash_session_id, method (`cash/debit/credit/pix/voucher/other`), amount_cents, tendered_cents?, change_cents?, status (`confirmed/voided`), received_by_user_id, device_id, external_ref?, idempotency_key, voided_at, void_reason | cria `ledger_entries` payment/−; void cria payment_void/+ |
| `discounts` | tenant_id, tab_id, order_item_id?, kind (`percent/fixed`), value, amount_cents, reason, approved_by_user_id | materializa em ledger `discount` |
| `tab_closures` | tab_id (unique), items_total, service_fee, couvert, discounts, adjustments, grand_total, paid_total, closed_by, closed_at, snapshot JSONB | fotografia final; reconciliação compara com ledger |
| `cash_registers` | tenant_id, name, is_active | caixa físico |
| `cash_sessions` | tenant_id, cash_register_id, status (`open/closed`), opened_by, opened_at, opening_float_cents, closed_by, closed_at, expected JSONB por método, counted JSONB por método, blind_close bool | índice único parcial: um `open` por registradora |
| `cash_movements` | cash_session_id, type (`sale/withdrawal(sangria)/deposit(suprimento)/adjustment`), method, amount_cents, payment_id?, reason, by | |
| `cash_divergences` | cash_session_id, method, expected_cents, counted_cents, difference_cents, reason, acknowledged_by | nunca ajustada em silêncio |

### 1.7 Estoque (Fase E — modelar depois, listado para não esquecer)
`ingredients`, `ingredient_units`, `recipes` (ficha técnica: product_id/modifier_id → ingredient, qty), `stock_movements` (type `purchase/sale_consumption/waste/adjustment/transfer`, imutável), `suppliers`, `purchases`, `purchase_items`, `stock_policies` (permitir negativo? baixar na venda ou na produção?).

### 1.8 Plataforma transversal
| Tabela | Campos-chave | Notas |
|--------|--------------|-------|
| `idempotency_keys` | tenant_id, scope, key, request_hash, response_status, response_body JSONB, created_at | UNIQUE (tenant_id, scope, key); limpeza após 24 h |
| `domain_events` | seq bigserial, id uuid, tenant_id, channel, type, payload JSONB, created_at | outbox; SSE lê por `seq` |
| `audit_log` | tenant_id?, actor_type (`user/device/guest/system`), actor_id, action, entity_type, entity_id, before JSONB, after JSONB, request_id, ip, at | |
| `jobs` | tenant_id?, type, payload, run_at, attempts, locked_at, locked_by, status, last_error | worker com `SKIP LOCKED` |
| `print_jobs` (Fase E) | tenant_id, printer_id, ticket_id, payload, status, attempts | |
| `printers` (Fase E) | tenant_id, name, station_id, connection JSONB | |

## 2. Máquinas de estado

Regra geral: transição inválida devolve `409 INVALID_TRANSITION` com estado atual. Toda transição grava `order_events`/`audit_log` e um `domain_event`.

### 2.1 Mesa (estado derivado, não coluna)
`free` (sem sessão aberta) → `open` (sessão open) → `closing` (conta pedida / em pagamento) → `free` (sessão closed).
Derivar de `table_sessions` evita estado impossível "mesa livre com sessão aberta".

### 2.2 Sessão de mesa
```
open ──(pedir conta | caixa inicia fechamento)──▶ closing ──(todas as tabs closed)──▶ closed
  ▲                                                  │
  └──────────(reabrir: novo pedido autorizado)────────┘
open/closing ──(staff, sessão vazia sem itens)──▶ closed (cancelada)
```
Invariantes: só uma sessão não-`closed` por mesa (índice parcial). `closed` é terminal. Reabrir uma sessão `closed` não existe: abre-se **nova** sessão (histórico intacto). Sessão aberta por cliente nasce com `verified_at = null` quando `customer_order_mode ≠ direct`.

### 2.3 Comanda (tab)
`open` → `closed`. Fecha só quando `saldo(ledger) = 0` **e** nenhum item em estado `queued/preparing` (itens em produção devem ser entregues ou cancelados antes). Comanda fechada **não aceita** itens, pagamentos ou descontos; correção posterior = `adjustment` em nova comanda de ajuste com permissão de gerente (rastreável), nunca reabrir.

### 2.4 Pedido (order) — materializado a partir dos itens
```
submitted ──(auto ou staff confirma)──▶ accepted ──▶ in_production ──▶ ready ──▶ delivered
    │                                        │              │
    └────────── cancelled ◀──────────────────┴──────────────┘ (regras abaixo)
submitted ──(sessão não verificada + staff rejeita)──▶ rejected
```
- `submitted → accepted`: automático quando `customer_order_mode = direct` ou sessão já verificada; senão aguarda salão (com timeout configurável que alerta, nunca cancela sozinho).
- `in_production` quando qualquer ticket `preparing`; `ready` quando todos os tickets `ready`; `delivered` quando todos entregues (ou cancelados, se ao menos um entregue).
- `cancelled` = todos os itens cancelados. Pedido com itens mistos permanece no estado dos itens ativos.

### 2.5 Item do pedido
```
queued ──▶ preparing ──▶ ready ──▶ delivered
  │            │            │
  └─cancel─────┴─cancel─────┴─cancel(raro, exige gerente)──▶ cancelled
```
- Cancelar em `queued`: garçom/caixa com `orders.cancel.before_production`; reverte cobrança integral (`item_reversal`); estoque não foi baixado (ou é revertido).
- Cancelar em `preparing/ready`: exige `orders.cancel.after_production` + motivo + decisão `charge_on_cancel` (cliente paga: nenhum estorno; cortesia/perda: `item_reversal` + registro de perda para estoque/CMV). KDS mostra alerta "CANCELADO" no ticket.
- Cancelar `delivered`: só gerente; sempre com motivo; tratado como estorno.
- Item **não pode** voltar de `ready` para `preparing` sem "recall" explícito (ação separada, auditada).

### 2.6 Ticket de produção
`queued → preparing → ready → delivered`; `recall` de `ready → preparing` (conta `recall_count`); `cancelled` quando todos os itens do ticket cancelados. Bump em ticket já `ready` é idempotente (não erro), pois dois KDS podem bumpar quase ao mesmo tempo.

### 2.7 Pagamento
`confirmed` (nasce confirmado; não existe "pending" no MVP porque o registro é manual) → `voided` (estorno lógico; exige permissão + motivo; gera contra-lançamento). Nunca DELETE. Pagamento pós-MVP via PSP terá `pending → confirmed/failed/expired` e webhook idempotente.

### 2.8 Sessão de caixa
`open → closed`. Fechar: sistema calcula esperado; operador informa contado; se diferença ≠ 0 exige motivo → `cash_divergences`. Pagamentos só podem ser registrados em sessão `open` da registradora do dispositivo. Reabrir não existe; correções = movimento de ajuste na próxima sessão com referência.

### 2.9 Cancelamento (processo, não tabela própria)
Ordem: validar permissão → carregar item com `FOR UPDATE` → validar estágio → atualizar item/ticket → lançar ledger conforme `charge_on_cancel` → registrar estoque (Fase E) → `order_events` + `audit_log` + `domain_event` → tudo na mesma transação.

## 3. Estados impossíveis e como são impedidos

| Estado impossível | Mecanismo |
|-------------------|-----------|
| Duas sessões abertas na mesma mesa | índice único parcial |
| Item em comanda fechada | checagem em transação com lock na tab + trigger `BEFORE INSERT` em `order_items` que verifica `tabs.status` |
| Pagamento contado duas vezes | idempotency key + `payments` UNIQUE (tenant_id, idempotency_key); ledger derivado do pagamento na mesma transação |
| Pedido pago que "desaparece" | ledger append-only; `orders` nunca DELETE (soft `cancelled`); FK RESTRICT |
| Total do cliente diferente do servidor | cliente só envia ids; servidor calcula; UI mostra total retornado |
| Dois caixas abertos na mesma registradora | índice único parcial |
| Fechar caixa com comanda paga em dinheiro fora da sessão | pagamento exige `cash_session_id` open; fechar sessão bloqueia novos pagamentos (status check em transação) |
| Ticket bumpado por KDS de outra estação/tenant | canal SSE e rota validam device→station→tenant |
| Cliente da mesa 3 vendo comanda da mesa 7 | token de sessão escopado; toda query por `table_session_id` do token |
| Preço alterado no admin muda pedido antigo | snapshot no item |
| Estoque negativo silencioso | `stock_policies.allow_negative` + `CHECK` condicional / verificação com lock (Fase E) |

## 4. Cálculo de totais (fonte: `packages/domain/totals.ts`)

```
items_total   = Σ line_total_cents (itens não cancelados ou cancelados com charge_on_cancel)
discounts     = Σ discount entries (≤ items_total)
service_fee   = round_half_even((items_total − discounts) × service_fee_bps / 10000)   # se aplicado
couvert       = couvert_cents × guest_count (per_guest) | couvert_cents (per_tab)      # se aplicado
grand_total   = items_total − discounts + service_fee + couvert + adjustments
paid_total    = Σ payments confirmed − Σ voided
balance       = grand_total − paid_total     # fecha quando 0
```
Divisão por N pessoas: `split(total, n)` distribui centavos residuais nas primeiras parcelas; soma das parcelas == total (teste obrigatório). Taxa de serviço "opcional" removida = entrada `service_fee` negativa de igual valor com motivo `customer_declined`, não apagar a original.

## 5. Cenários de concorrência e resposta do sistema

| Cenário | Mecanismo | Resultado esperado |
|---------|-----------|--------------------|
| Cliente toca duas vezes em "Enviar" | mesma `Idempotency-Key` (gerada ao montar o carrinho e trocada só após sucesso) | 1 pedido; segunda resposta idêntica à primeira |
| Timeout de rede e retry automático | idem | 1 pedido |
| Retry com carrinho alterado e mesma chave | `request_hash` difere | `409`; app gera nova chave e reenvia |
| Cliente envia pedido enquanto caixa transfere a mesa | pedido referencia `tab_id` (não `table_id`); transferência move a sessão/tab com lock | pedido cai na comanda certa, na nova mesa |
| Dois operadores fecham a mesma comanda | `SELECT tab FOR UPDATE`; segundo vê `closed` | segundo recebe `409` com estado atual |
| Dois caixas registram pagamento na mesma comanda | lock na tab; ledger append | ambos registrados; se ultrapassar saldo, segundo recebe `409 OVERPAYMENT` (ou troco, se dinheiro) |
| Dois KDS bumpam o mesmo ticket | `UPDATE ... WHERE status='preparing'` | um vence; outro recebe estado atual, sem erro visual |
| Cozinha inicia item enquanto garçom cancela | lock no item; ordem de chegada decide; cancelamento após `preparing` cai na regra "after_production" | estado coerente + alerta no KDS |
| Item esgota entre abrir cardápio e enviar | validação server-side por item no `POST /orders` | `422` com lista de itens indisponíveis; UI remove e pede confirmação |
| Preço muda entre cardápio e envio | servidor usa preço vigente e devolve total; se diferir do exibido em > 0, UI mostra novo total antes de confirmar (`price_changed` flag) | sem cobrança surpresa |
| Duas pessoas usam a mesma mesa (dois celulares) | dois `guests` na mesma sessão | carrinhos independentes, pedidos na mesma comanda (ou tabs separadas se configurado) |
| Dois dispositivos alteram estoque do último item | `UPDATE stock SET qty = qty − x WHERE qty ≥ x` (Fase E) | um vence, outro recebe indisponível |
| SSE cai e volta | `Last-Event-ID` + `GET` completo | nenhum evento perdido, nenhum duplicado (dedupe por `event.id`) |
| Servidor reinicia no meio da transação | tudo em transação única | ou tudo ou nada; cliente faz retry idempotente |

## 6. Convenções de API (resumo; detalhe em `contracts`)

- REST JSON sob `/v1`, tenant resolvido por contexto (nunca `tenant_id` no corpo enviado pelo cliente para dados de negócio).
- Mutações críticas exigem `Idempotency-Key`.
- Erros: `{ error: { code, message, details, request_id } }`; códigos estáveis (`INVALID_TRANSITION`, `ITEM_UNAVAILABLE`, `TAB_CLOSED`, `OVERPAYMENT`, `PERMISSION_DENIED`, `IDEMPOTENCY_MISMATCH`, ...).
- Listagens com paginação por cursor.
- SSE em `/v1/stream?channels=...` autenticado por cookie/token; evento `{ id, seq, type, payload, at }`.
