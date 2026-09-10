# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.5/§1.6/§2/§4/§5 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M7 (cardápio do cliente + carrinho) está mergeado em `main` (commit `b5a35dd`, PR #11, CI verde: 63/63 testes). Este plano do M8 assume isso como ponto de partida — **primeiro milestone da Fase C, CRÍTICO** (regra 2 do CLAUDE.md: dinheiro, comanda → 3 frentes obrigatórias).

## Milestone atual: **M8 — Criação idempotente de pedido** (Fase C)

### Problema
Cliente monta carrinho (M7) e staff tem catálogo/mesas (M5/M6), mas nenhum pedido pode ser criado ainda. M8 é o primeiro milestone onde dinheiro real entra em jogo: um pedido precisa nascer com preço travado (snapshot), roteado para a estação certa, sem nunca duplicar (double-tap, timeout+retry) e sem nunca aceitar um total calculado pelo cliente.

### Escopo desta fatia (decisões registradas)
- **Sem modificador no item do pedido.** Carrinho do M7 não tem modificador (decisão do M7); item de pedido aqui é só `product_id` + `quantity` + observação livre — `order_item_modifiers`/seleção de modificador ficam para quando a UI de modificador existir (M7.1/M9+, junto do resto da UI de modificador).
- **Sem KDS.** Este milestone cria o ticket de produção (`production_tickets`) e o pedido nasce `queued`, mas **nenhuma tela lê/atualiza esses tickets ainda** — isso é M9. Aqui só a criação e o roteamento por estação são provados (via consulta direta ao banco, não via UI).
- **Sem pagamento/caixa.** `ledger_entries` só recebe o lançamento `item_charge` (cobrança); pagamento é Fase D.
- **Confirmação de pedido de cliente**: `tenant_settings.customer_order_mode` já existe (M1) mas hoje sempre é `confirm_first_order` por padrão do seed — para não bloquear o milestone com uma tela de "confirmar pedido" que não existe (isso é produto do M10), a fatia do M8 assume o pedido nasce direto `accepted` quando vem de staff, e como `submitted` aguardando quando vem de cliente **mas sem tela de confirmação ainda** — registrado como pendência explícita de UX para o M10, não escondida.
- **Pedido pela equipe (`orders.create.on_behalf_of_table`) é rota, não é o foco da prova** — a prova principal é o pedido do cliente (via `guest`/sessão de mesa), que é o caminho mais arriscado (sem sessão de staff).

### Resultado esperado
1. **Schema** (`packages/db/src/schema/orders.ts`): `orders`, `order_items`, `production_tickets`, `order_events`. `ledger_entries` (mínimo: `item_charge`, o resto dos tipos entra na Fase D quando fizer sentido).
2. **`POST /v1/orders`** (staff, com `X-Tenant-Id` + `orders.create`) e **`POST /public/:tenantSlug/orders`** (cliente, via cookie de sessão de mesa/guest, M6) — ambas convergem no mesmo serviço de criação.
3. **Idempotência real** (`idempotency_keys`, já existe desde o M1, nunca usada até agora): `Idempotency-Key` obrigatório; mesma chave + mesmo corpo → devolve a resposta gravada da primeira vez, sem criar nada de novo; mesma chave + corpo diferente → `409 IDEMPOTENCY_MISMATCH`.
4. **Preço sempre do servidor**: cliente manda só `productId`+`quantity`(+`notes`); servidor busca `products.base_price_cents` vigente, grava como `unit_price_cents`/`name_snapshot` no item — nunca aceita preço do corpo da requisição.
5. **Validação de disponibilidade**: item indisponível/inativo no momento do pedido → `422 ITEM_UNAVAILABLE` com a lista dos itens problemáticos, nenhum pedido parcial é criado.
6. **Roteamento em tickets**: um `production_tickets` por estação distinta presente no pedido (ex.: 2 itens de cozinha + 1 de bar = 2 tickets).
7. **Efeitos colaterais na mesma transação**: `order_events` (histórico), `ledger_entries` (`item_charge` por item), `domain_events` (outbox, canal `orders`, tipo `order.created` — consumido por SSE só no M9, mas o outbox já nasce certo agora).

### Arquivos envolvidos
- `packages/db/src/schema/orders.ts` (novo) + export em `schema/index.ts`.
- `packages/contracts/src/orders.ts` (novo): schema Zod de criação.
- `apps/api/src/lib/idempotency.ts` (novo): wrapper genérico em cima de `idempotency_keys` — reaproveitável por qualquer mutação crítica futura (pagamento, cancelamento).
- `apps/api/src/modules/orders/{service,routes}.ts` (novo).
- `apps/api/src/app.ts`: registrar `orderRoutes`.
- Testes: `apps/api/test/integration/orders.test.ts`.

### Riscos
- **Idempotência mal implementada é pior que não ter** (dá falsa sensação de segurança). A prova tem que incluir: mesmo corpo duas vezes → 1 pedido; corpo diferente mesma chave → 409; duas requisições **concorrentes** (não sequenciais) com a mesma chave → ainda 1 pedido (teste com `Promise.all`, mesmo padrão do M6).
- **Cálculo de total**: mesmo sem taxa de serviço/desconto ainda (Fase D), o total do pedido precisa ser reconstruído por consulta independente (soma de `order_items.line_total_cents`) batendo com o que a API devolveu.
- **Ator do pedido**: cliente (via `guest`, cookie do M6) e staff (via sessão, M2) são dois caminhos de autenticação diferentes convergindo no mesmo serviço — a função de criação não pode assumir um tipo de ator específico.

### Testes (3 frentes — CRÍTICO: dinheiro, comanda, regra 2 do CLAUDE.md)
1. **Idempotência real**: mesmo corpo + mesma chave 2x → 1 pedido; corpo diferente + mesma chave → 409; duas requisições concorrentes (`Promise.all`) com a mesma chave → 1 pedido (consulta independente ao banco confirma).
2. **Dinheiro/preço**: preço do item vem do servidor mesmo se o cliente mandar outro valor no corpo (campo ignorado, não validado — nem chega a ler); total reconstruído via `SELECT SUM(line_total_cents)` bate com a resposta da API.
3. **Isolamento + disponibilidade**: pedido não pode conter produto de outro tenant; produto indisponível/inativo no momento do pedido → `422` com a lista, nenhuma linha criada (nem `orders`, nem `order_items`, nem ledger — tudo ou nada, mesma transação).

### Critérios de aceite
- [ ] Duplo envio (double-tap) do cliente nunca duplica pedido, comprovado com requisições concorrentes reais.
- [ ] Preço do pedido é sempre o do servidor no momento da criação (snapshot).
- [ ] Pedido roteado corretamente por estação em `production_tickets`.
- [ ] `pnpm check`/`pnpm build` verdes; CI remota verde.
- [ ] Docs atualizados; `ACTIVE_PLAN.md` reescrito para M9 (KDS em tempo real).

### Gate de Plano (respondido em 2026-09-10)
Problema entendido (primeiro milestone onde dinheiro real é criado, motivo do tratamento crítico) · solução menor não existiria (idempotência real + snapshot de preço não são simplificáveis) · afeta dinheiro/comanda diretamente (regra 2, 3 frentes) · risco principal é concorrência/idempotência (mesma classe de risco já resolvida no M6 para sessão de mesa, reaproveitando a lição de "transações separadas") · prova por integração real + concorrência real + consulta independente · rollback trivial (tabelas novas, sem dado de produção ainda) · multi-tenant preservado (RLS normal, ator resolvido por dois caminhos possíveis mas sempre dentro do tenant certo).

## Próximos milestones (resumo; detalhes em `ROADMAP.md`)
M9 KDS em tempo real (SSE, consome o outbox que o M8 já deixa pronto) → M10 acompanhamento/expedição/chamados (aqui entra a tela de confirmação de pedido de cliente, pendência registrada acima) → M11 cancelamentos/pedido pela equipe.
