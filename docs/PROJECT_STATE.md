# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-10 (M9 concluído e mergeado — cozinha em tempo real funcionando, sessão Sonnet 5, execução hands-off)
**Fase:** C — Pedido ponta a ponta · **Milestone concluído:** M9 KDS em tempo real (SSE) · **Próximo:** M10 Acompanhamento, expedição e chamados (`ACTIVE_PLAN.md`)
**Branch:** `main` · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Commit:** `17d8f53` (merge PR #15, M9)
**CI:** verde nos 3 jobs (lint·format·typecheck·unit, integração Postgres — **73/73 testes** em 13 arquivos, build+smoke).

## 1. Estado funcional do produto
O ciclo central do restaurante já fecha de ponta a ponta tecnicamente: cliente escaneia o QR (M6), vê o cardápio (M5/M7), monta o carrinho e envia o pedido (M8) — e a cozinha vê esse pedido aparecer na tela do KDS em tempo real (M9), consegue iniciar o preparo e marcar como pronto. **Ainda falta**: o cliente não acompanha o próprio pedido na tela dele (M10), não há chamado de garçom/pedir conta, não há cancelamento pela UI, e nada de pagamento/caixa ainda (Fase D).

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| identity, catálogo, mesas/sessão, cardápio do cliente | **funcionais (M1–M7)** | — |
| criação de pedido (idempotente, preço do servidor, ticket, ledger) | **funcional (M8)** | — |
| **KDS em tempo real** (SSE, tickets por estação, bump idempotente) | **funcional (M9)** | pareamento via `/admin/devices` |
| acompanhamento do cliente / confirmação de pedido / chamados | não iniciado | M10 |
| cancelamento / pedido pela equipe (UI) | API pronta desde M8, sem UI | M11 |
| caixa / pagamentos | não iniciado | Fase D |

## 3. Ambiente conhecido
Sem mudança (Docker local com falha, ENV-1; workspace OneDrive, ENV-5; ENV-6 recorrente, sempre pego antes do push). Execução hands-off desde 2026-09-10 (merge após CI verde não espera confirmação).

## 4. Evidências do M9 (resumo; detalhes em `QA_LEDGER.md`, decisão em `DECISIONS.md` ADR-033)
- `GET /v1/stream` (SSE, autenticado por dispositivo): polling do outbox `domain_events` a cada 700ms (decisão registrada — não LISTEN/NOTIFY), replay via `Last-Event-ID`, heartbeat.
- `GET/POST /v1/kds/tickets/*`: bump idempotente via `UPDATE ... WHERE status = $antigo` — corrida entre dois KDS resolvida pelo próprio Postgres, não por lógica de aplicação.
- `pairing_codes.station_ids` (campo reservado desde o M3) finalmente preenchido e propagado para `devices.station_ids` no pareamento.
- **73/73 testes de integração verdes** (68 de M1–M8 + 9 novos M9), incluindo um teste de **SSE real** (servidor `listen()` + `fetch` nativo, não `fastify.inject()` — pesquisado antes de escrever, regra 12: inject() não serve para stream de verdade).
- Telas novas: `/admin/devices` (gerar código de pareamento KDS com estações) e `/kds` (parear + quadro de tickets ao vivo).
- **Limitação real registrada:** sem Postgres local, não foi possível testar visualmente o fluxo completo (pareamento real → ticket aparecendo → bump) numa tela real — só via CI + inspeção de estados de erro no browser.

## 5. Decisões que não podem ser esquecidas
**ADR-025** (`devices` sem RLS). **ADR-030** (`selfLookupPolicy`). **ADR-031** (M6: `guests` sem RLS; concorrência com transações separadas quando há exceção que aborta). **ADR-032** (M8: idempotência via `ON CONFLICT DO NOTHING` na mesma transação — diferente do M6 porque aqui não há exceção abortando). **ADR-033** (M9: SSE via polling do outbox; token de dispositivo por query string só no `EventSource`; bump via `UPDATE ... WHERE status=$antigo`).

## 6. Perguntas abertas para o Victor
Sem mudança — ver `PRODUCT_CONTEXT.md §2`.

## 7. Dependendo do Victor / pendências operacionais
- Reiniciar a máquina para tentar destravar o Docker Desktop (destravaria testar o ciclo completo pedido→cozinha numa tela real, ponta a ponta).
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).

## 8. Próximo passo exato
Executar o **M10** conforme `docs/ACTIVE_PLAN.md`: acompanhamento de status por item no cliente, estimativa em faixa, "chamar garçom"/"pedir conta", confirmação de pedido de sessão não verificada (pendência registrada desde o M8).
