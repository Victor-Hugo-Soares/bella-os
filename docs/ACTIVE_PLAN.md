# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.4/§2.4/§5 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M9 (KDS em tempo real) está mergeado em `main` (commit `17d8f53`, PR #15, CI verde: 73/73 testes). Este plano do M10 assume isso como ponto de partida.

## Milestone atual: **M10 — Acompanhamento, expedição e chamados** (Fase C)

### Problema
O cliente envia o pedido (M8) e a cozinha o vê e prepara (M9), mas o cliente fica sem nenhum retorno depois de enviar — não sabe se foi aceito, se está pronto, não tem como chamar o garçom ou pedir a conta. M10 fecha essa lacuna e resolve a pendência deixada pelo M8: sessão de mesa não verificada precisa de um caminho real de aceitar/rejeitar (hoje o pedido só nasce `submitted` e fica parado).

### Escopo desta fatia (decisões registradas)
- **"Expedição" (lista de prontos para entrega) é para o STAFF**, não para o cliente — uma tela simples (`/admin` ou `/kds` mesmo, decisão no início) listando tickets `ready` de todas as estações, para quem for levar à mesa. Não confundir com o acompanhamento do CLIENTE (que só vê o status do próprio pedido).
- **Sem app de garçom dedicado.** "Chamada aparece no salão" = uma lista simples de `service_requests` abertos, visível em qualquer tela de staff autenticada (reaproveita o admin, `requirePermission`) — não é um app de salão dedicado com mapa de mesas (isso é produto de fase mais madura).
- **Confirmação de pedido de sessão não verificada**: implementa o caminho que o M8 deixou pendente — quando `tenant_settings.customer_order_mode !== 'direct'`, o pedido nasce `submitted` e só um staff com permissão aceita/rejeita (`PATCH /v1/orders/:id/accept` / `/reject`). Sem UI de configurar esse modo por tenant ainda (fica no valor padrão do seed).
- **Sem SSE dedicado ao cliente ainda desta forma**: reaproveita o mesmo mecanismo do M9 (outbox + polling), mas autenticado pelo **guest** (cookie de sessão de mesa, M6), não por dispositivo — precisa de uma pequena extensão em `requireDevice`-like para aceitar guest também, ou uma rota de stream própria para clientes.

### Resultado esperado
1. `service_requests` (`DOMAIN_MODEL.md §1.4`): `call_waiter`/`request_bill`, criado pelo cliente (autenticado por sessão de mesa), fechado por staff.
2. `PATCH /v1/orders/:id/accept` e `/reject` (staff, permissão a definir — reaproveitar `orders.create` ou nova chave).
3. Endpoint de status do pedido para o cliente (`GET /public/.../orders/:id` ou "meus pedidos da sessão") + SSE para o cliente (variante do M9, autenticado por guest).
4. Tela do cliente: status do pedido (por item), botões "chamar garçom"/"pedir a conta".
5. Tela de staff: lista de tickets prontos para expedir + lista de chamados abertos, com ação de "atender".

### Riscos
- Maior risco é de ESCOPO (esta é a fatia mais "produto" até agora, fácil de crescer). Manter o corte estrito: sem mapa de salão, sem notificação push, sem múltiplas comandas por sessão neste milestone.
- SSE para o cliente reaproveita a lição do M9 (`ADR-033`) — cuidado para não duplicar toda a lógica; extrair o que for genérico.

### Testes (2 frentes — mudança normal)
1. Integração: aceitar/rejeitar pedido muda o estado certo; chamado é criado e aparece para staff; cliente só vê os próprios pedidos/chamados (nunca de outra sessão/tenant).
2. E2E manual real: cliente chama garçom, staff vê o chamado; status do pedido muda na tela do cliente quando o KDS avança o ticket.

### Gate de Plano (a responder no início da execução do M10)
A preencher no início da implementação — este plano ainda não teve o Gate respondido (checkpoint da sessão antes de continuar).

## Próximos milestones (resumo; detalhes em `ROADMAP.md`)
M11 cancelamentos/pedido pela equipe (UI) → Fase D (M12–M15: ledger completo, caixa, pagamentos, divisão de conta, Golden Journey completa).
