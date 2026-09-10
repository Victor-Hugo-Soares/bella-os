# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-10 (M8 concluído e mergeado — primeiro milestone crítico da Fase C, sessão Sonnet 5, execução hands-off)
**Fase:** C — Pedido ponta a ponta · **Milestone concluído:** M8 Criação idempotente de pedido · **Próximo:** M9 KDS em tempo real (`ACTIVE_PLAN.md`)
**Branch:** `main` · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Commit:** `123537a` (merge PR #13, M8)
**CI:** verde nos 3 jobs (lint·format·typecheck·unit, integração Postgres — **68/68 testes** em 11 arquivos, build+smoke).

## 1. Estado funcional do produto
Pela primeira vez um pedido de verdade pode nascer: o cliente monta o carrinho (M7) e envia; o servidor trava o preço, roteia os itens para a estação certa (cozinha/bar/...) e grava a cobrança no ledger — tudo de forma que um double-tap ou um timeout com retry nunca duplica o pedido, mesmo sob concorrência real. **Ainda não existe tela nenhuma que leia esse pedido** (nem KDS, nem acompanhamento do cliente) — isso é o M9/M10.

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| identity, catálogo, mesas/sessão, cardápio do cliente | **funcionais (M1–M7)** | — |
| **criação de pedido** (idempotente, preço do servidor, ticket, ledger) | **funcional (M8)** | sem tela de leitura ainda |
| KDS (ler/atualizar ticket em tempo real) | não iniciado | **M9** |
| acompanhamento do cliente / confirmação de pedido | não iniciado | M10 |
| cancelamento / pedido pela equipe (UI) | API pronta desde M8 (`orders.create.on_behalf_of_table`), sem UI | M11 |
| caixa / pagamentos | não iniciado | Fase D |

## 3. Ambiente conhecido
Sem mudança (Docker local com falha, ENV-1; workspace OneDrive, ENV-5; ENV-6 recorrente). Execução hands-off desde 2026-09-10.

## 4. Evidências do M8 (resumo; detalhes em `QA_LEDGER.md`, decisão em `DECISIONS.md` ADR-032)
- Reaproveitadas `idempotency_keys` e `domain_events` (existiam desde o M1, nunca usadas).
- Idempotência real via `INSERT ... ON CONFLICT DO NOTHING` (não duas transações separadas como no M6 — aqui o `ON CONFLICT` não aborta a transação, então dá pra continuar na mesma). `apps/api/src/lib/idempotency.ts` reaproveitável para pagamento/cancelamento depois.
- **68/68 testes de integração verdes** (63 de M1–M7 + 5 novos M8): fluxo feliz com preço/ledger/ticket conferidos por consulta independente; tudo-ou-nada em item indisponível; idempotência nos 3 casos (repetição, corpo diferente → 409, **concorrência real via `Promise.all`** → nunca 2 pedidos).
- **Bug real de teste pego pela própria CI** (não de produção): sufixo "único" dos nomes de teste usava `newId().slice(0,8)` — mas isso é o TIMESTAMP de um UUIDv7 (quase constante dentro de uma execução), não a parte aleatória. Corrigido para `.slice(-8)` (cauda aleatória).
- **Escopo cortado conscientemente:** `sequence_number` é contador simples (sem reset por dia operacional); sem modificador no item; sem KDS/pagamento.

## 5. Decisões que não podem ser esquecidas
**ADR-025** (`devices` sem RLS). **ADR-030** (`selfLookupPolicy`). **ADR-031** (M6: `guests` sem RLS; concorrência exige transações separadas quando há exceção que aborta). **ADR-032** (M8: idempotência via `ON CONFLICT DO NOTHING` na MESMA transação — padrão diferente do M6 porque aqui não há exceção abortando; `sequence_number` simplificado).

## 6. Perguntas abertas para o Victor
Sem mudança — ver `PRODUCT_CONTEXT.md §2`.

## 7. Dependendo do Victor / pendências operacionais
- Reiniciar a máquina para tentar destravar o Docker Desktop.
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).

## 8. Próximo passo exato
Executar o **M9** conforme `docs/ACTIVE_PLAN.md`: SSE (`/v1/stream`) consumindo o outbox `domain_events` que o M8 já deixou pronto, tela de KDS por estação (iniciar/pronto/recall), polling de segurança, reconexão sem duplicar.
