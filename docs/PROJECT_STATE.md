# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-10 (M7 concluído e mergeado — Fase B completa, sessão Sonnet 5, execução hands-off)
**Fase:** C — Pedido ponta a ponta (recém-iniciada) · **Milestone concluído:** M7 Cardápio do cliente + carrinho (fim da Fase B) · **Próximo:** M8 Criação idempotente de pedido (`ACTIVE_PLAN.md`) — primeiro milestone **crítico** da fase
**Branch:** `main` · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Commit:** `b5a35dd` (merge PR #11, M7)
**CI:** verde nos 3 jobs (lint·format·typecheck·unit, integração Postgres — **63/63 testes** em 10 arquivos, build+smoke).

## 1. Estado funcional do produto
A Fase B está completa: um cliente físico escaneia o QR da mesa, abre uma sessão de verdade, vê o cardápio real do restaurante (só o que está ativo e disponível) e monta um carrinho que sobrevive a recarregar a página. **Ainda não envia o pedido** — isso é o M8, que também é o primeiro milestone crítico da Fase C (dinheiro/comanda, 3 frentes obrigatórias).

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| identity (login, sessão, permissão, dispositivo, PIN) | **funcional (M1–M3)** | — |
| `apps/web` (shell, login, design system) | **funcional (M4/M4.1)** | — |
| catálogo (estações, categorias, produtos) | **funcional (M5)** | modificadores: API pronta, sem UI |
| mesas, áreas, sessão de mesa | **funcional (M6)** | — |
| **cardápio do cliente + carrinho** | **funcional (M7)** | carrinho local; nenhum pedido é criado ainda |
| criação de pedido / ledger / tickets | não iniciado | **M8 — crítico, 3 frentes** |
| KDS em tempo real (SSE) | não iniciado | M9 |
| caixa / pagamentos | não iniciado | Fase D |

## 3. Ambiente conhecido
Sem mudança (Docker local com falha, ENV-1; workspace OneDrive, ENV-5; ENV-6 recorrente, sempre pego antes do push). **Modo de execução hands-off** desde 2026-09-10 (pedido do Victor): merge após CI verde não espera confirmação; só bloqueio real interrompe a execução.

## 4. Evidências do M7 (resumo; detalhes em `QA_LEDGER.md`)
- `GET /public/:tenantSlug/catalog`: só categoria ativa + produto ativo e disponível, roda dentro de `withTenant()` normal (tenant resolvido pelo slug — mesmo padrão do M6, `resolveTenantBySlug` extraído para reaproveitar entre módulos).
- **63/63 testes de integração verdes** (60 de M1–M6 + 3 novos M7): produto esgotado/desativado nunca aparece na leitura pública; isolamento entre tenants; slug inexistente → 404.
- Carrinho (Zustand + `persist`, versão confirmada via npm antes de instalar — regra 12): um store por sessão de mesa, `Idempotency-Key` gerada ao montar (pronta para o M8 consumir).
- **E2E manual real** (browser, servidor Node simulando as rotas públicas — sem Postgres local): sessão abre, cardápio carrega, adicionar item atualiza contador e CTA do rodapé, total correto, **carrinho sobrevive a reload completo** (prova real do `persist`, não só "parece que sim"). Mobile (375px) e desktop.
- **Escopo cortado conscientemente:** sem SSE/realtime (infraestrutura é do M9) e sem modificadores na tela do cliente (M5 não tem UI de modificador nem no admin ainda).

## 5. Decisões que não podem ser esquecidas
**ADR-025** (`devices`/`pairing_codes` sem RLS). **ADR-030** (M5: `selfLookupPolicy`). **ADR-031** (M6: `guests` sem RLS; cookie opaco sem lib nova; concorrência exige transações separadas). Nenhum ADR novo no M7 (decisões foram de escopo, não de arquitetura — registradas no `ACTIVE_PLAN.md` do M7).

## 6. Perguntas abertas para o Victor
Sem mudança — ver `PRODUCT_CONTEXT.md §2`.

## 7. Dependendo do Victor / pendências operacionais
- Reiniciar a máquina para tentar destravar o Docker Desktop.
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).

## 8. Próximo passo exato
Executar o **M8** conforme `docs/ACTIVE_PLAN.md`: `POST /v1/orders` idempotente (cliente e staff), snapshot de preço, roteamento em tickets de produção por estação, ledger `item_charge`, eventos `order_events` + outbox `domain_events`. **Crítico — 3 frentes obrigatórias** (regra 2 do CLAUDE.md: dinheiro, comanda).
