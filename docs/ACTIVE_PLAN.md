# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.6/§4 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M21 (fundação do novo design system) está mergeado em `main` (commit `4f8940b`, PR #28, CI verde de primeira). Tokens do handoff do Claude Design já valem em todo `apps/web` — a maioria dos componentes usa classes de token (`bg-background`, `text-foreground`, `bg-brand`...) em vez de cor fixa, então boa parte do re-skin já "aconteceu sozinha" ao trocar os tokens; falta ajustar forma/composição específica (raio de card, chips, detalhe de produto) que os tokens não cobrem.

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

## Milestone atual: **M22 — Cliente (re-skin + telas que faltavam)**

### O que já existe vs. o que falta
`apps/web/src/components/customer/customer-menu.tsx` já cobre funcionalmente
4 dos 5 artboards do mockup num componente só: cardápio (`MenuList`/
`ProductCard`), carrinho (`CartScreen`), acompanhamento + atendimento
(`OrdersScreen`, que já tem "chamar garçom"/"pedir a conta" — o mockup separa
em dois artboards, aqui fica junto por afinidade funcional, decisão mantida).
Falta o artboard **B2 — Detalhe do produto**: hoje o cliente só adiciona ao
carrinho direto do card da lista, sem uma tela de detalhe.

### Resultado esperado
1. Cards do cardápio/carrinho/pedidos com o raio/sombra corretos
   (`rounded-radius-lg`, borda `border-strong`, sombra sutil) em vez do
   `rounded-md` genérico atual.
2. Cabeçalho do cardápio com o badge de marca (reaproveitar `BellaMark`, fundo
   `bg-brand`/ícone branco em vez de contorno) + selo "Aberto" (verde,
   `--success`) + nome do tenant — como no mockup B1.
3. Chips de categoria fixos no topo (scroll horizontal) substituindo a lista
   vertical de seções — cardápios reais têm dezenas de itens, navegação por
   chip é o padrão do setor (iFood/Rappi/Goomer, ver estudo de mercado já
   registrado na conversa).
4. **Tela de detalhe do produto** (B2, nova): abre ao tocar no card (não no
   botão de quantidade, que continua adicionando direto da lista); bloco de
   imagem com placeholder (sem foto real — `catalog.ts` não tem campo de
   imagem, escopo do M5, não é deste milestone resolver), nome, descrição,
   preço, stepper de quantidade, botão "Adicionar ao carrinho".
5. Sem tocar em nenhuma chamada de API nova — tudo já existe desde M7/M8/M10;
   isto é puramente composição/visual.

### Riscos
- **Placeholder de foto pode parecer "quebrado"** se for só um retângulo cinza
  — usar um bloco com o ícone de prato/talher (Lucide) centralizado sobre
  `--card-warm`, não um cinza genérico de "imagem faltando".
- **Chips de categoria com scroll horizontal em 360px** — testar de verdade
  no navegador nessa largura (`FRONTEND_GUIDELINES.md §5`), não só em 375/414.

### Testes (2 frentes — normal, é UI sem mutação de dinheiro)
1. Visual/browser real: cardápio, detalhe do produto, carrinho e pedidos
   testados em 375px width, incluindo os 4 estados (loading/vazio/erro/sucesso)
   onde já existem.
2. Regressão: fluxo golden path do cliente (abrir mesa → ver cardápio → abrir
   detalhe → adicionar → carrinho → enviar pedido → acompanhar) continua
   funcionando ponta a ponta depois do re-skin — mesmo tipo de checagem manual
   já feita no M10 quando o botão "enviar pedido" foi conectado à API.

### Gate de Plano (respondido no início da execução do M22)
1. **Tela de detalhe do produto é um novo `screen` no mesmo componente**
   (`'menu' | 'product' | 'cart' | 'orders'`), não uma rota Next nova — seguindo
   o padrão já estabelecido em `CustomerMenu` (troca de `screen` em vez de
   navegação de URL, mantém o estado da sessão/carrinho sem re-fetch).
2. **Placeholder de imagem é um bloco visual só, sem `<img>` nem asset novo** —
   não inventar upload de imagem agora (fora de escopo, `catalog.ts` M5).
3. **Chips de categoria filtram a MESMA lista já carregada** (client-side),
   sem nova chamada de API — o catálogo inteiro já vem de uma vez desde o M7.
4. **Adicionar direto do card da lista continua funcionando** (não força
   passar pelo detalhe) — muita gente já sabe o que quer pedir, forçar um
   passo a mais pra tudo seria fricção sem necessidade real.

---

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
