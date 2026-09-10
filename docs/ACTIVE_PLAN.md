# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.6/§4 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M21 (fundação) e M22 (cliente) estão mergeados em `main` (PR #28 commit `4f8940b`; PR #29 commit `6da6ed2`, ambos CI verde de primeira). M23 (KDS) em execução.

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
4. **M24+ — Admin**: re-skin das telas existentes (dashboard, catálogo,
   dispositivos, chamados, pedido pela equipe, mesas/áreas, login) + construir
   o que só existe como API hoje: comandas abertas, fechar comanda/pagamento,
   abrir/fechar caixa, relatório do dia, equipe/permissões, configurações.
   Provavelmente mais de um milestone — decidir o corte ao chegar lá.

## Milestone atual: **M23 — KDS (re-skin pro tema escuro quente)**

### Resultado esperado
1. Raiz da tela do KDS (pareamento + board) ganha a classe `.kds-theme` — o
   tema escuro quente vale em toda a superfície, não só no board.
2. Correção de token: `.kds-theme` tinha `--card-warm: var(--surface)` (herdado
   por engano do M21) — os botões de ação do mockup ("Iniciar preparo"/"Marcar
   pronto") usam um bege claro (`#faf6f1`/`#302923`) mesmo no tema escuro, não
   a cor escura de superfície. Corrigido em `globals.css` com
   `--card-warm`/`--card-warm-foreground` distintos por tema.
3. Botões de ação do ticket trocam de `bg-brand`/`bg-success` genéricos para
   `bg-card-warm text-card-warm-foreground`, igual ao mockup. Raio dos cards e
   botões vai de `rounded-md` pro `rounded-lg` (13px) do design system novo.
4. Badge da tela de pareamento reaproveita o mesmo padrão de badge de marca já
   usado no cliente (M22): ícone sobre `bg-card-warm`.
5. Sem mudança de lógica — `TicketBoard`/pareamento/SSE/watchdog/banner de
   conexão (M20) continuam exatamente como estão, é puramente re-skin visual.

### Riscos
- **Confundir `--card-warm` do tema claro com o do tema escuro** — são valores
  diferentes de propósito (claro: bege sobre fundo branco; escuro: bege claro
  sobre fundo escuro, para destacar o botão de ação). Cada tema define o seu
  dentro do próprio escopo (`:root` vs `.kds-theme`), não há token único
  global pra isso.

### Testes (2 frentes — normal, é UI sem mutação de dinheiro)
1. Visual/browser real com fixture fake (`/v1/kds/tickets` fake em 3001):
   pareamento, board com ticket em cada status (novo/em preparo/pronto,
   incluindo item cancelado), estado vazio, 375px width — cores confirmadas
   via `getComputedStyle` (não só visual), inclusive checando explicitamente
   que os botões de ação usam o `--card-warm` correto do tema escuro
   (`#faf6f1`/`#302923`), não o antigo `--surface`.
2. Regressão: clique real em "Iniciar preparo" contra a fixture fake muda o
   ticket pra "Em preparo" na tela (mesmo padrão de golden path usado no M20).

### Gate de Plano (respondido no início da execução do M23)
1. **Reaplicar `.kds-theme` na raiz da página inteira** (pareamento + board +
   todos os estados), não só no board — o mockup não tem uma tela de
   pareamento clara/escura misturada.
2. **Corrigir o token `--card-warm` do `.kds-theme` antes de usá-lo** — usar o
   valor errado (igual a `--surface`) faria os botões de ação ficarem da
   mesma cor do card, sem destaque, diferente do mockup.
3. **Zero mudança de lógica de negócio/realtime** — é reskin puro; watchdog,
   SSE, polling de segurança e o pareamento continuam como estão desde o M20.

---

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
