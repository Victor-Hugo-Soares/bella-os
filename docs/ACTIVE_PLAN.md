# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.6/§4 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M21–M25 estão mergeados em `main` (PR #28 `4f8940b`, PR #29 `6da6ed2`, PR #30 `9e5478f`, PR #31 `3abbf6f`, PR #32 `049ad82`, todos CI verde de primeira). **Fecha o handoff de design completo nas 3 superfícies** (re-skin) **+ as telas de comandas/caixa/relatório que só existiam como API**. Falta só M26 (equipe/permissões, configurações) — precisa de backend novo, não é reskin; Gate de Plano ainda não respondido, ver seção abaixo.

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

## Milestone atual: **M26 — Equipe/permissões e configurações (backend novo)**

**Ainda sem Gate de Plano respondido — não implementar sem antes decidir isto.**
Diferente de M21–M25 (tudo "tela nova pra API que já existia"), o M26 precisa
de domínio novo: hoje NÃO existe nenhuma rota para gerenciar staff/papéis
(`users.manage`/`roles.manage` só reservados em `packages/domain/src/permissions.ts`,
nunca referenciados por uma rota) nem para configurações de tenant
(`settings.manage` idem; `tenant_settings` existe como tabela — usada por
`computeBill` pro `service_fee_bps` — mas sem endpoint de leitura/edição).

Perguntas em aberto antes de poder escrever um Gate de Plano de verdade
(decisão de produto, não só técnica — considerar perguntar ao Victor se a
resposta não for óbvia pelo mockup aprovado):
1. **Equipe**: convite por email + senha temporária, ou só o dono cria conta
   direto com senha definida na hora (mais simples, mas não é o padrão
   "convite" de produtos SaaS)? Melhor consultar Better Auth (`docs/ARCHITECTURE.md`)
   pra saber qual fluxo já é suportado sem trabalho extra de auth.
2. **Papéis**: existe um conjunto fixo de papéis (dono/gerente/caixa/garçom/
   cozinha) ou é permissão granular por usuário? `permissions.ts` já define
   chaves individuais — decidir se a UI expõe papéis pré-montados (mais simples
   pro Victor operar) ou checkboxes por permissão (mais flexível, mais
   arriscado de errar).
3. **Configurações**: quais campos de `tenant_settings` já existem hoje no
   schema (`service_fee_bps` confirmado; conferir o resto lendo
   `packages/db/src/schema/billing.ts` antes de supor) — a tela só deve expor
   o que já tem campo real, não inventar configuração nova sem pedido do
   Victor.
4. **Conferir o canvas do Claude Design aprovado** — as 12 telas de
   "Admin·Caixa" citadas no início do handoff provavelmente incluem
   equipe/configurações; olhar lá antes de desenhar do zero.

## Histórico — M25 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
Três telas novas consumindo API 100% pronta desde M12–M16 (zero lógica nova no backend): `/admin/tabs` (lista de comandas → detalhe com desconto/pagamento multi-forma/troco condicional/fechamento), `/admin/cash` (abrir/fechar sessão + sangria/suprimento, divergência sempre visível), `/admin/reports` (métricas do dia, intervalo fixo "hoje"). Contratos verificados linha a linha contra `routes.ts`/`service.ts`/`packages/contracts` antes de implementar (regra 12 do `CLAUDE.md`). `Idempotency-Key` gerada por tentativa de submit. Testado com fixture fake stateful reproduzindo o comportamento real (desconto reduz saldo, pagamento parcial com troco calculado certo, fechamento só habilita com saldo 0); achado real na própria fixture (CORS sem `idempotency-key` no allow-headers, não um bug do produto).

---

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
