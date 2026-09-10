# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.6/§4 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M21–M24 (fundação, cliente, KDS, admin parte 1 — re-skin) estão mergeados em `main` (PR #28 `4f8940b`, PR #29 `6da6ed2`, PR #30 `9e5478f`, PR #31 `3abbf6f`). Fecha a parte "re-skin visual" do handoff de design nas 3 superfícies. M25 (admin, parte 2 — comandas/caixa/relatório) em execução.

## Nova frente: handoff de design (Claude Design → produto real)

O Victor desenhou as 20 telas das três superfícies num canvas do Claude Design
(`bella-os-artboards.vsoareslins452.chatgpt.site`) e aprovou a direção visual —
**diferente da que estava em `FRONTEND_GUIDELINES.md` até aqui**. Decisão dele,
2026-09-11: "gostei mt mais d seu" (do resultado do Claude Design) — manter o
estilo criado lá, não forçar de volta o dark oklch original. Pediu pra eu focar
no handoff completo: implementar tudo, ele confere no final.

Extraí o sistema de verdade direto do DOM do mockup (cores computadas, fontes,
radius, sombra — não é achismo visual):

- **Tipografia**: só **Switzer** (Fontshare, já carregada no projeto), sem
  Schibsted Grotesk nem JetBrains Mono. Pesos 400 (corpo) / 500–600 (títulos e
  ênfase). Letter-spacing leve negativo em títulos (~-0.35 a -0.6px).
- **Cliente + Admin (tema claro)**: fundo `#f2f2f2`, cards brancos com borda
  `1px solid #ddd/#e8e8e8`, raio 13px, sombra muito sutil
  (`0 8px 24px rgba(0,0,0,.03)`); texto principal `#252525`/`#242424`, texto
  secundário `#444`/`#686868`; variante de card "quente" `#faf7f3`; marca
  vermelho `#bd3027` (hover `#a52620`); controles/botões raio ~7px.
- **KDS (tema escuro, mas quente — não o cinza-azulado antigo)**: fundo
  `#202020`, cards de ticket `#2d2a28`, texto `#faf7f3`/`#fffaf4`, mesmo raio
  7–8px.

### Plano de execução (várias entregas, cada uma seu próprio PR/CI/merge)
1. **M21 — Fundação do design system**: reescrever `globals.css` (tokens,
   tema claro como padrão do cliente/admin + tema escuro quente dedicado ao
   KDS), `layout.tsx` (parar de carregar Schibsted Grotesk/JetBrains Mono),
   corrigir `FRONTEND_GUIDELINES.md` (fonte de verdade documental — o doc
   antigo não reflete mais a direção aprovada).
2. **M22 — Cliente**: re-skin do cardápio/carrinho/detalhe existentes +
   construir acompanhamento de pedido e atendimento (chamar garçom/pedir
   conta) que só existiam como API.
3. **M23 — KDS**: re-skin pro tema escuro quente do mockup (board, pareamento,
   banner de conexão já construído no M20).
4. **M24 — Admin, parte 1**: re-skin visual das telas existentes (dashboard,
   catálogo, dispositivos, chamados, pedido pela equipe, mesas/áreas, login).
5. **M25 — Admin, parte 2a (comandas/caixa/relatório)**: construir UI para
   API que já existe desde M13–M16 — comandas abertas, fechar comanda
   (descontos/pagamentos/fechamento), abrir/fechar sessão de caixa
   (sangria/suprimento), relatório do dia. Puramente "tela nova para API
   existente", sem lógica de negócio nova no backend.
6. **M26+ — Admin, parte 2b (equipe/permissões, configurações)**: **backend
   novo, não só UI** — levantado ao planejar o M25 que não existe NENHUM
   endpoint pra gerenciar staff/papéis (`users.manage`/`roles.manage` só
   reservados em `permissions.ts`, sem rota) nem configurações de tenant
   (`settings.manage` idem). Maior, decidir o corte ao chegar lá.

## Milestone atual: **M25 — Admin, parte 2a (comandas/caixa/relatório)**

### API já existente (confirmada lendo `apps/api/src/modules`, sem lógica nova)
- **Comandas**: `GET /v1/tabs/open` (`manage`), `GET /v1/tabs/:id/bill`
  (qualquer staff), `GET /v1/tabs/:id/split?parts=N` (informativo).
- **Fechar comanda**: `POST /v1/tabs/:id/discounts` (`discounts.apply`, union
  `{kind:'percentage',bps,reason}` OU `{kind:'fixed',amountCents,reason}`);
  `POST /v1/tabs/:id/payments` (`payments.record`, **exige
  `Idempotency-Key`**, `tenderedCents` só aceito/obrigatório se
  `method==='cash'`); `POST /v1/payments/:id/void` (`payments.void`);
  `POST /v1/tabs/:id/close` (`tabs.close`, idempotente, 409 se saldo > 0).
- **Caixa**: `POST /v1/cash-sessions/open` (`cash.open`, um registrador por
  tenant); `GET /v1/cash-sessions/current`; `POST
  /v1/cash-sessions/:id/movements` (`cash.movement`, sangria/suprimento);
  `POST /v1/cash-sessions/:id/close` (`cash.close`, `counted` por forma de
  pagamento, forma omitida = contado 0, divergência nunca escondida).
- **Relatório**: `GET /v1/reports/daily?from=&to=` (`reports.view`, ISO
  explícito — sem cálculo de "dia operacional"/timezone, a UI decide o
  intervalo, ex. hoje 00:00–agora local).

### Resultado esperado
1. **Tela "Comandas abertas"** (`/admin/tabs`): lista de comandas abertas
   (`GET /v1/tabs/open`), cada uma abre um detalhe com a conta
   (`GET /v1/tabs/:id/bill`) e ações de fechar.
2. **Fluxo de fechamento**: aplicar desconto (opcional), registrar
   pagamento(s) — múltiplas formas por comanda é caso real (parte cartão,
   parte pix) — com `Idempotency-Key` gerado por tentativa de clique (não por
   render, pra permitir novo pagamento após um erro sem reusar a chave de uma
   tentativa falha), UI de troco só quando `method==='cash'`, fechar comanda
   quando saldo chegar a 0.
3. **Tela "Caixa"** (`/admin/cash`): abrir sessão (valor de abertura),
   registrar sangria/suprimento, ver sessão atual, fechar com contagem por
   forma de pagamento — divergência exibida claramente (não escondida, mesmo
   padrão do backend).
4. **Tela "Relatório do dia"** (`/admin/reports`): intervalo padrão "hoje"
   (00:00 local até agora), faturamento/ticket médio/mais vendidos/cancelamentos
   e descontos por operador.
5. Estilo: mesmo design system das telas já re-skinadas no M24 (`rounded-lg`
   13px + sombra sutil pra cards, `rounded-md` 7px pra controles, números
   monetários com `.font-mono-tabular`).

### Riscos (dinheiro/comanda/caixa — regra 2 do `CLAUDE.md`: 3 frentes, não 2)
- **`Idempotency-Key` reusada por engano** entre tentativas de pagamento
  causaria um pagamento "fantasma" nunca gravado (a segunda tentativa
  retornaria o resultado cacheado da primeira, que pode ter falhado por outro
  motivo) — gerar a chave nova a cada submit, nunca por render/mount.
- **Troco exibido quando não é dinheiro** — UI precisa esconder o campo
  `tenderedCents` pra qualquer `method !== 'cash'`, replicando exatamente a
  regra do backend, não só "parece certo visualmente".
- **Timezone do relatório "hoje"** — calcular o intervalo local do
  navegador é aceitável (mesma decisão consciente do M16: sem biblioteca de
  timezone testada), mas testar perto da virada de dia não é escopo — só
  confirmar que bate com o relógio local do teste.

### Testes (3 frentes — dinheiro/comanda/caixa, regra 2 do `CLAUDE.md`)
1. Visual/browser real com fixture fake: comandas abertas, abrir detalhe,
   aplicar desconto, registrar pagamento parcial (parte cartão + parte
   dinheiro com troco), fechar comanda; abrir/fechar caixa com divergência
   proposital; relatório do dia com dados de exemplo.
2. Verificação independente do contrato: confirmar contra o código real da
   API (não só a memória do que foi lido na sondagem) que os campos
   enviados pela UI batem exatamente com o que cada rota espera — igual ao
   que já foi feito nas sondagens de M13/M14.
3. Regressão de idempotência: reenviar a mesma ação de pagamento (dois
   cliques rápidos, chave igual) não duplica cobrança — testado de verdade,
   não só lido no código do backend.

### Gate de Plano (respondido no início da execução do M25)
1. **Só as 4 áreas com API pronta** (comandas, fechar comanda, caixa,
   relatório) — equipe/permissões e configurações ficam pra depois, exigem
   endpoint novo, fora do escopo "tela para API existente" deste milestone.
2. **`Idempotency-Key` gerada por tentativa de submit**, nunca por
   montagem de componente — evita reuso acidental entre cliques.
3. **UI de troco condicional a `method === 'cash'`**, replicando a regra do
   backend exatamente, não uma aproximação visual.
4. **Sem seletor de intervalo customizado no relatório nesta entrega** — só
   "hoje" (00:00 local até agora); intervalo arbitrário fica pra quando
   houver demanda real (mesma decisão do M16).

---

## Histórico — M24 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
Re-skin visual das 9 telas de admin existentes: `resource-crud.tsx` corrigido primeiro (cobre categorias/estações/áreas de uma vez), depois 8 containers de card individuais (dashboard, produtos, dispositivos, chamados, pedido pela equipe, mesas) de `rounded-md border border-border` pra `rounded-lg border border-border-strong` + sombra sutil. Inputs/botões mantidos em `rounded-md` (7px, já correto). `login/page.tsx` já usava tokens do M21 corretamente. **Achado real de processo**: primeira rodada de CI falhou não por lint, mas por `pnpm format` (prettier) — eu tinha rodado só lint/typecheck/build local, sem `pnpm check` completo; corrigido com `pnpm format:fix` e um segundo commit.

## Histórico — M23 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`.kds-theme` aplicado em toda a tela do KDS (pareamento + board, não só board); corrigido bug real de token herdado por engano do M21 (`--card-warm` do tema escuro era igual a `--surface`) — adicionado par `--card-warm`/`--card-warm-foreground` correto (`#faf6f1`/`#302923`) pros botões de ação "Iniciar preparo"/"Marcar pronto"; raio `rounded-md` → `rounded-lg`. Achado feito proativamente (revisando a própria extração de cores do mockup antes de tocar na tela), não via bug de teste visual. Zero mudança de lógica de realtime/watchdog (M20 intacto).

## Histórico — M22 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`customer-menu.tsx` re-skinado (raio `rounded-lg`/sombra sutil, cabeçalho com badge de marca + selo "Aberto" + chips de categoria com scroll horizontal filtrando client-side); nova `ProductDetailScreen` (artboard B2, placeholder de foto via ícone Lucide sobre `--card-warm`, sem upload real); `QuantityControl` ganhou variante `full`. Achados reais testando no navegador: chip sintético "Destaques" colidia com nome de categoria real (renomeado pra "Todos"); `ProductCard` estava com `<button>` aninhando outros `<button>`s (HTML inválido) — trocado por `<div role="button" tabIndex={0}>` com teclado.

## Histórico — M21 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`globals.css` reescrito com os tokens extraídos do DOM do mockup aprovado (hex/rgb, não oklch); tema claro vira padrão de `:root`; `.kds-theme` como tema escuro quente fixo e isolado do KDS; família tipográfica única (Switzer — Schibsted Grotesk e JetBrains Mono removidas); `--brand` continua white-label, só o valor default mudou; `FRONTEND_GUIDELINES.md` reescrito por completo.

## Histórico — M20 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
Heartbeat SSE virou evento nomeado (era comentário, invisível ao `EventSource`); banner "sem conexão" no KDS (watchdog 30s + `onerror` imediato); retry com backoff em `apiFetch`/`GET`; teste real de desconectar→reconectar (`AbortController`) provando que `Last-Event-ID` não perde nem duplica evento; testado visualmente num navegador real; `ARCHITECTURE.md` corrigido (canal único `orders`, canais múltiplos eram só documentados desde o M9).

## Histórico — M18 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`packages/db/scripts/backup.sh`/`restore.sh` (`pg_dump -Fc` / `pg_restore --clean --if-exists`); job novo `backup-restore` na CI prova o ciclo completo (backup → banco novo → restore → contagem de linhas bate); `docs/RUNBOOK_INCIDENTS.md` novo.

## Histórico — M16 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`GET /v1/reports/daily?from=&to=` (`reports.view`): faturamento, ticket médio, mais vendidos, cancelamentos/descontos por operador — sem tabela nova, só consulta. Faturamento replica a regra de `items_total` do `computeBill` (M12). Sem cálculo automático de "dia operacional" (decisão consciente, timezone sem biblioteca testada). Fecha `KNOWN_ISSUES.md` R-16.

---

## Histórico — M15 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`tab_closures` (fotografia final, `tab_id` único, migration `0012`); `POST /v1/tabs/:id/close` (permissão nova `tabs.close`) só fecha com saldo 0, idempotente por construção; `GET /v1/tabs/:id/split?parts=N` divide o saldo restante (`splitEvenly` do M0), puramente informativo. Golden Journey: um teste único prova o ciclo inteiro cliente→cozinha (KDS real)→salão→caixa→fechamento, ledger somando exatamente 0 ao final.

## Histórico — M14 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`cash_movements` (sangria/suprimento, `cash.movement`) e `cash_divergences` (schema novo, migration `0011`); `POST /v1/cash-sessions/:id/close` (`cash.close`) calcula `expected` por forma de pagamento sempre derivado de `payments`+`cash_movements` (nunca armazenado à parte), grava divergência só quando `counted ≠ expected` (nunca ajusta em silêncio), idempotente por reconstrução. Corrigidas 3 divergências reais entre `DOMAIN_MODEL.md` e o que já estava implementado desde o M13.

## Histórico — M13 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`cash_registers`/`cash_sessions`/`payments` (migration `0010`); abrir sessão de caixa (`cash.open`, uma por registrador via índice único); registrar pagamento (`payments.record`, nunca excede o saldo — `OVERPAYMENT` — reaproveitando `computeBill` do M12 dentro da MESMA transação para serializar concorrência real); estornar pagamento (`payments.void`, idempotente).
