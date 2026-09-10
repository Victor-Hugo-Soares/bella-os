# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.6/§4 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M20 (degradação/reconexão endurecida) está mergeado em `main` (commit `52d39d2`, PR #27, CI verde nos 4 jobs de primeira). Fechou a lista de prioridades técnicas da Fase E.

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

## Milestone atual: **M21 — Fundação do novo design system**

### Gate de Plano (respondido no início da execução do M21)
1. **Tema claro vira o padrão de `:root`** (cliente + admin) — inverte a
   prioridade anterior (dark por padrão, `.light` como variante). O antigo
   tema escuro cinza-azulado é removido, não mantido como opção.
2. **KDS ganha um tema escuro PRÓPRIO, fixo, não é "dark mode" do usuário** —
   aplicado via classe (`.kds-theme`) na raiz da tela do KDS, com os tokens
   quentes extraídos do mockup (`#202020`/`#2d2a28`/`#faf7f3`), nunca
   alternável nem compartilhado com o resto do sistema. Cliente/admin não
   ganham dark mode nesta entrega — não foi pedido, não está no mockup.
3. **Uma família tipográfica só: Switzer.** Remove `Schibsted_Grotesk` e
   `JetBrains_Mono` de `next/font/google` em `layout.tsx` — elas nunca mais
   são carregadas, não só deixam de ser usadas (economiza requisição/peso).
   `.font-mono-tabular` (usado para dinheiro/IDs) passa a usar a pilha
   monoespaçada do sistema (`ui-monospace`), sem depender de uma webfont —
   mantém números alinhados sem carregar mais uma fonte.
4. **`--brand` continua sendo o ponto de override white-label** (`ARCHITECTURE.md`,
   multi-tenant é princípio) — só o valor padrão muda para o vermelho `#bd3027`
   extraído do mockup; a variável continua existindo e sobrescrevível por tenant.
5. **Cores semânticas (`--danger`/`--success`) recalibradas para o tema claro**
   — os valores antigos eram calibrados pro fundo escuro oklch e ficariam sem
   contraste correto no fundo claro novo.
6. **`docs/FRONTEND_GUIDELINES.md` reescrito, não só remendado** — é a fonte
   de verdade documental (regra do `CLAUDE.md`) e a direção mudou o bastante
   pra merecer reescrita completa da seção de tokens, não um patch.

---

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
