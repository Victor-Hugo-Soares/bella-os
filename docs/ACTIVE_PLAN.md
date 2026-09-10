# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.5/§2.6/§5/§6 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M8 (criação idempotente de pedido) está mergeado em `main` (commit `123537a`, PR #13, CI verde: 68/68 testes). Este plano do M9 assume isso como ponto de partida.

## Milestone atual: **M9 — KDS em tempo real** (Fase C)

### Problema
M8 já cria `production_tickets`, mas nenhuma tela lê ou atualiza esses tickets — o pedido cai num buraco negro do ponto de vista da cozinha. M9 é a primeira tela operacional real: um tablet na cozinha (dispositivo pareado, M3) vê os tickets da(s) sua(s) estação(ões) aparecerem em tempo real e consegue avançar o estado (iniciar → pronto), com recall quando necessário.

### Escopo desta fatia (decisões registradas)
- **Atribuição de estação ao dispositivo KDS**: `devices.station_ids` já existe (reservado desde o M3) mas nunca foi preenchido. Neste milestone, o corpo de `POST /v1/devices/pairing-codes` ganha um campo opcional `stationIds` (só usado quando `deviceKind='kds'`), gravado no dispositivo na troca do código. **Reatribuir estação de um dispositivo já pareado fica para depois** (hoje: reparear).
- **Sem alerta de cancelamento** — cancelamento é M11, não existe ainda; a UI do KDS não precisa desse caso neste milestone.
- **SSE mínimo viável**: canal único por tenant (`orders`), sem múltiplos canais configuráveis ainda (`?channels=` aceita mas só `orders` existe de verdade). Payload do evento é o mínimo para o KDS decidir se precisa recarregar (id do ticket/pedido), não o pedido inteiro — o cliente SSE dispara um refetch da lista ao receber qualquer evento (mais simples e mais robusto que manter estado incremental complexo neste primeiro milestone de realtime).
- **Reconexão via `Last-Event-ID`**: `domain_events.seq` (bigserial) já existe desde o M1 exatamente para isso.

### Resultado esperado
1. **`GET /v1/stream`** (autenticado por dispositivo, `X-Device-Token`): SSE que emite um evento por linha nova de `domain_events` do canal `orders` do tenant do dispositivo; suporta `Last-Event-ID` (replay do que perdeu durante a desconexão); heartbeat periódico (comentário SSE) para o proxy/browser não fechar a conexão por inatividade.
2. **`GET /v1/kds/tickets`** (autenticado por dispositivo): lista tickets `queued`/`preparing`/`ready` das estações do dispositivo, com os itens do pedido (nome, quantidade, observação).
3. **`POST /v1/kds/tickets/:id/start`, `/ready`, `/recall`**: transições de estado, autenticadas por dispositivo, **idempotentes** (bump num ticket que já está no estado alvo não é erro — dois KDS bumpando o mesmo ticket quase ao mesmo tempo faz um vencer e o outro ver o estado já mudado, sem erro visual, `DOMAIN_MODEL.md §5`).
4. **Tela KDS** (`apps/web/src/app/(kds)/kds/page.tsx`, placeholder desde o M4): lista de tickets em tempo real via SSE + **polling de segurança** (recarrega periodicamente mesmo sem evento, para o caso de SSE cair silenciosamente); fonte grande (legível a 1,5 m), botões enormes, sem scroll horizontal (`FRONTEND_GUIDELINES.md §5`).
5. **Pareamento de KDS pela tela de admin** (`/admin/tables` ou uma nova aba `/admin/devices`, decisão no início da execução): gerar código de pareamento com estação(ões) escolhidas.

### Arquivos envolvidos
- `apps/api/src/modules/realtime/{service,routes}.ts` (novo): SSE.
- `apps/api/src/modules/kds/{service,routes}.ts` (novo): listar/transicionar tickets.
- `apps/api/src/modules/identity/devices/{routes,service}.ts`: `stationIds` no corpo de criação de pareamento.
- `apps/web/src/app/(kds)/kds/page.tsx`: conteúdo real.
- `apps/web/src/app/(admin)/admin/devices/**` (novo, se decidido no início): pareamento de KDS.
- Testes: `apps/api/test/integration/kds.test.ts`, `apps/api/test/integration/realtime.test.ts`.

### Riscos
- **SSE em teste de integração** (`fastify.inject()`) não mantém conexão aberta da forma que um browser real mantém — pesquisar como o próprio Fastify testa streams antes de escrever o teste (regra 12), ou usar um cliente HTTP real (`undici`/`fetch`) contra um servidor `listen()` de verdade só para este teste, em vez de `inject()`.
- **Corrida entre dois dispositivos bumpando o mesmo ticket**: usar `UPDATE ... WHERE status = $esperado` (não um `SELECT` seguido de `UPDATE` separado) para o "primeiro vence, segundo não erra" ser garantido pelo próprio banco, não por lógica de aplicação.
- **Heartbeat/timeout de proxy**: sem controle sobre o Railway em produção ainda (isso é Fase F) — o heartbeat do M9 já é a mitigação correta independente de hospedagem.

### Testes (2 frentes — mudança normal; ainda não é dinheiro novo, é leitura+transição de estado sobre dado já criado no M8 crítico)
1. Integração (Postgres real, CI): ticket aparece na lista do dispositivo certo (e não de outra estação/tenant); transição válida funciona; bump idempotente (segunda chamada no mesmo estado não erra); SSE emite evento após criação de pedido (via cliente HTTP real, não `inject()`).
2. E2E manual real (browser, mesmo padrão de smoke com API/dados de exemplo quando Postgres local não disponível): tela KDS mostra ticket, iniciar/pronto funcionam, visual legível a distância (fonte grande) em pelo menos uma largura.

### Critérios de aceite
- [ ] Pedido criado no M8 aparece na tela KDS certa via SSE (não só via polling).
- [ ] Bump idempotente: chamar `/start` duas vezes não é erro.
- [ ] `pnpm check`/`pnpm build` verdes; CI remota verde.
- [ ] Docs atualizados; `ACTIVE_PLAN.md` reescrito para M10 (acompanhamento do cliente, expedição, chamados).

### Gate de Plano (a responder no início da execução do M9)
Problema entendido (primeira tela operacional real, fecha o ciclo pedido→cozinha) · solução menor não existiria (SSE é decisão de arquitetura já registrada, ADR do M0/ARCHITECTURE.md) · risco principal é técnico (testar SSE, corrida de bump) · prova por integração real + E2E manual · rollback trivial (rotas novas) · multi-tenant preservado (dispositivo já resolve tenant, M3).

## Próximos milestones (resumo; detalhes em `ROADMAP.md`)
M10 acompanhamento do cliente/expedição/chamados (aqui entra a tela de confirmação de pedido pendente desde o M8) → M11 cancelamentos/pedido pela equipe (UI).
