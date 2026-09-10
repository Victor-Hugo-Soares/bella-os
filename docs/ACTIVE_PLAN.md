# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.6/§4 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M21 (fundação), M22 (cliente) e M23 (KDS) estão mergeados em `main` (PR #28 commit `4f8940b`; PR #29 commit `6da6ed2`; PR #30 commit `9e5478f`, todos CI verde de primeira). M24 (admin, parte 1 — re-skin das telas existentes) em execução.

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
5. **M25+ — Admin, parte 2**: construir o que só existe como API hoje —
   comandas abertas, fechar comanda/pagamento, abrir/fechar caixa, relatório
   do dia, equipe/permissões, configurações. Envolve dinheiro/comanda/caixa
   (regra 2 do `CLAUDE.md`: 3 frentes de teste, não 2) — decidir o corte de
   telas por milestone ao chegar lá, provavelmente mais de um.

## Milestone atual: **M24 — Admin, parte 1 (re-skin visual)**

### O que já existe
9 páginas (`(admin)/admin/{dashboard,login,devices,service-requests,staff-order,
tables,tables/areas,catalog,catalog/categories,catalog/products,catalog/stations}`)
todas anteriores ao M21 — ainda usam `rounded-md`, `border-border` sem
`-strong`, sem a sombra sutil do design novo (`shadow-[0_8px_24px_rgba(0,0,0,.03)]`),
e `login/page.tsx` tem 2 resquícios `oklch(...)` hardcoded do tema antigo. Não
existe um shell/layout compartilhado único para todo o admin — `catalog/layout.tsx`
e `tables/layout.tsx` são dois shells locais (header + tab-nav) estruturalmente
iguais; dashboard/login/devices/service-requests/staff-order montam o próprio
cabeçalho inline, sem componente compartilhado. `resource-crud.tsx` é usado por
categories/stations (CRUD genérico) — corrigir esse componente uma vez cobre
duas páginas de uma vez.

### Resultado esperado
1. Todos os cards/containers ganham `rounded-lg` (13px) + a sombra sutil do
   design system, substituindo `rounded-md`/sem sombra.
2. Bordas viram `border-border-strong` onde hoje é `border-border` genérico
   (mesmo padrão usado no re-skin do cliente/KDS).
3. Os 2 resquícios `oklch(...)` hardcoded em `login/page.tsx` viram tokens
   (`--border`/equivalente) — não pode sobrar cor não-tokenizada, o `--brand`
   branco-label deixaria de funcionar ali se um tenant trocasse a cor.
4. `resource-crud.tsx` corrigido primeiro (maior alavancagem — cobre
   categories + stations de uma vez), depois os 2 shells (`catalog`/`tables`
   layout — cobre a navegação em abas de 4 páginas), depois as 6 páginas com
   cabeçalho próprio (dashboard, login, devices, service-requests, staff-order,
   products — a maior individualmente, tem tabela/formulário próprios).
5. Sem mudança de lógica/API em nenhuma tela — puramente troca de classe
   utilitária de token, mesmo escopo do M22/M23.

### Riscos
- **Volume de arquivos (13) aumenta a chance de esquecer um resquício antigo**
  — verificar ao final com uma busca por `rounded-md` e `oklch(` dentro de
  `apps/web/src/app/(admin)` e `apps/web/src/components/catalog` pra garantir
  que não sobrou nada, não confiar só na lista inicial.

### Testes (2 frentes — normal, é UI sem mutação de dinheiro)
1. Visual/browser real: login, dashboard, catálogo (3 sub-telas), dispositivos,
   chamados, pedido pela equipe, mesas (2 sub-telas) — confirmando via
   `getComputedStyle` que não sobrou `oklch(` nem radius antigo, com fixture
   fake de staff logado (sem Postgres local — ENV-1).
2. Regressão: fluxos de CRUD (criar/editar categoria, produto, estação; criar
   dispositivo) continuam funcionando ponta a ponta depois do re-skin.

### Gate de Plano (respondido no início da execução do M24)
1. **Ordem de execução por alavancagem**: `resource-crud.tsx` → shells
   (`catalog`/`tables` layout) → páginas standalone — não por ordem alfabética
   de arquivo, pra reduzir retrabalho (arrumar o componente compartilhado uma
   vez em vez de repetir o mesmo ajuste em cada página que o usa).
2. **Zero mudança de lógica/contrato de API** — é reskin puro, mesmo tipo de
   escopo do M22 (cliente) e M23 (KDS).
3. **Fecha com busca ampla por `rounded-md`/`oklch(` no admin inteiro antes de
   declarar pronto** — não confiar só na lista de arquivos levantada no início.

---

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
