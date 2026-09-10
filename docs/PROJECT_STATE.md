# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-10 (M14 concluído e mergeado, sessão Sonnet 5, execução hands-off)
**Fase:** D — Caixa e financeiro (quase completa) · **Milestone concluído:** M14 Fechamento de caixa e relatórios · **Próximo:** M15 Divisão de conta e Golden Journey completa (`ACTIVE_PLAN.md`, fecha a Fase D)
**Branch:** `main` · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Commit:** `ba7c790` (merge PR #23, M14)
**CI:** verde nos 3 jobs (lint·format·typecheck·unit, integração Postgres — `cash-close.test.ts` novo, 5 testes; build+smoke). Uma regressão real de teste pega na primeira rodada de CI e corrigida antes do merge (ver `QA_LEDGER.md`).

## 1. Estado funcional do produto
Fase C completa (M8–M11): ciclo cliente→cozinha→salão inteiro pela UI real. M12 deu à comanda a capacidade de calcular o próprio total. M13 trouxe o dinheiro entrando de verdade (pagamento contra a comanda). M14 fecha o ciclo do turno: sangria/suprimento e fechamento de sessão de caixa com contagem por forma de pagamento vs. esperado, divergência sempre registrada. **O que ainda falta para a Fase D fechar:** fechar a comanda de fato (hoje o saldo chega a 0 mas `tabs.status` nunca muda para `closed`) e divisão de conta — ambos M15.

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| identity, catálogo, mesas/sessão, cardápio+carrinho | **funcionais (M1–M7)** | — |
| pedido (criação, idempotência, ledger `item_charge`) | **funcional (M8)** | — |
| KDS em tempo real | **funcional (M9)** | — |
| acompanhamento, chamados, expedição | **funcional (M10)** | — |
| cancelamento de item, pedido pela equipe | **funcional (M11)** | transferência de mesa adiada, registrado |
| ledger completo (taxa, couvert, desconto), `GET /bill` | **funcional (M12)** | sem UI própria ainda — só API |
| sessão de caixa (abrir), pagamento (registrar/estornar) | **funcional (M13)** | sem UI própria ainda — só API |
| **sangria/suprimento, fechamento de caixa (contagem/divergência)** | **funcional (M14)** | sem UI própria ainda — só API; relatórios avançados adiados (sem tela para consumir ainda) |
| fechar comanda de fato, divisão de conta / Golden Journey completa | não iniciado | **M15** (fecha a Fase D) |

## 3. Ambiente conhecido
Sem mudança (Docker local com falha, ENV-1; workspace OneDrive, ENV-5; ENV-6 recorrente — não aconteceu no M14, mas segue no radar). Execução hands-off desde 2026-09-10.

## 4. Evidências do M14 (resumo; detalhes em `QA_LEDGER.md`)
- `packages/db/src/schema/billing.ts`: `cashMovements` (sangria/suprimento; `adjustment` reservado no `CHECK`, sem endpoint, YAGNI), `cashDivergences`. Migration `0011`.
- `POST /v1/cash-sessions/:id/close`: `expected` por forma de pagamento é sempre DERIVADO de `payments`+`cashMovements` (nunca uma coluna cacheada); divergência gravada só quando `counted ≠ expected` — inclusive forma esperada que o operador esqueceu de contar, tratada como 0 e virando divergência visível, nunca corrigida em silêncio.
- **Idempotente por reconstrução** (não por bloqueio): como `payments`/`cashMovements` ficam imutáveis depois que a sessão fecha, fechar duas vezes recalcula e devolve o mesmo resumo, só não duplica o registro da divergência — testado explicitamente (fechar duas vezes, contar `cash_divergences` continua 1).
- `POST /v1/cash-sessions/:id/movements`: sangria/suprimento, exige sessão `open`.
- **5 testes de integração novos** (Postgres real, CI).
- **3 divergências reais corrigidas entre `DOMAIN_MODEL.md` e o código já em produção desde o M13** (tipo `sale` em `cash_movements` nunca existiu; `cash_sessions` nunca teve `expected`/`counted` JSONB; `blind_close` nunca foi implementado) — a documentação estava desatualizada havia dois milestones, só agora corrigida.
- **Regressão real pega pela própria CI**, não bug de produção: `payments.test.ts` (M13) abre — de propósito, para testar isolamento cross-tenant — uma sessão de caixa no `demo` e nunca fecha; `cash-close.test.ts` também usa `demo` e encontrou o registrador ocupado. Corrigido tornando o arquivo resiliente a estado residual de outros arquivos (fecha qualquer sessão aberta do `demo` no início, antes de qualquer teste).

## 5. Decisões que não podem ser esquecidas
**ADR-025, ADR-030, ADR-031** (RLS e exceções de tenant). **ADR-032** (M8: idempotência via `ON CONFLICT DO NOTHING`). **ADR-033** (M9: SSE via polling do outbox). **ADR-034** (M10: acompanhamento por polling). Nenhum ADR novo M11–M14 — decisões específicas de cada milestone ficam no respectivo Gate de Plano (`ACTIVE_PLAN.md`, arquivado em `QA_LEDGER.md`). **Importante para o M15:** testes de integração que precisam de uma sessão de caixa/registrador exclusivos devem ou (a) fechar tudo que abrirem, ou (b) começar limpando estado residual como `cash-close.test.ts` passou a fazer — nunca assumir um tenant "livre" só porque nenhum teste anterior *deveria* tê-lo usado.

## 6. Perguntas abertas para o Victor
Nenhuma pendência nova. Ver `PRODUCT_CONTEXT.md §2` para o quadro completo (Q6 — pagamento — já respondida em 2026-09-10).

## 7. Dependendo do Victor / pendências operacionais
- Reiniciar a máquina para tentar destravar o Docker Desktop (destravaria o Golden Journey completo com dados reais).
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).

## 8. Próximo passo exato
Executar o **M15** conforme `docs/ACTIVE_PLAN.md`: fechar a comanda de fato (`tabs.status = 'closed'`, `tab_closures` com a fotografia final), divisão de conta (por igual e por item/pessoa), e o Golden Journey completo de ponta a ponta (cliente pede → cozinha prepara → cliente acompanha → equipe cobra → caixa fecha o turno) — fecha a **Fase D**.
