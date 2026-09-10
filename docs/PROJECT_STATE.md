# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-10 (M16 concluído e mergeado — sessão Sonnet 5, execução hands-off)
**Fase:** D completa (M8–M15) · Fase E em andamento — **Milestone concluído:** M16 Relatório do dia operacional · **Próximo:** M18 Backup/restore (ordem escolhida pelo Victor: relatório → backup → resiliência)
**Branch:** `main` · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Commit:** `5342e84` (merge PR #25, M16)
**CI:** verde nos 3 jobs (lint·format·typecheck·unit, integração Postgres — `reports.test.ts` novo, 2 testes; build+smoke). Uma regressão real de teste pega na primeira rodada de CI e corrigida antes do merge (ver `QA_LEDGER.md`).

## 1. Estado funcional do produto
Fase D completa: ciclo operacional inteiro do restaurante provado por Golden Journey real, ledger fechando em exatamente 0. M16 (Fase E) fecha a lacuna que tinha ficado do M14 original: agora dá para consultar faturamento, ticket médio, mais vendidos e cancelamentos/descontos por operador de um intervalo de tempo.

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| identity, catálogo, mesas/sessão, cardápio+carrinho | **funcionais (M1–M7)** | — |
| pedido, KDS, acompanhamento, cancelamento | **funcionais (M8–M11)** | — |
| ledger, taxas/couvert/desconto, `GET /bill` | **funcional (M12)** | — |
| sessão de caixa, pagamento, sangria/suprimento, fechamento de caixa | **funcionais (M13–M14)** | — |
| fechar comanda, divisão de conta, Golden Journey | **funcional (M15)** | — |
| **relatório do dia operacional** (`GET /v1/reports/daily`) | **funcional (M16)** | sem UI própria — só API; fecha `KNOWN_ISSUES.md` R-16 |
| impressão térmica | **sem data** | Victor confirmou: cozinha só tela por enquanto (Q7) |
| estoque/ficha técnica/CMV | não iniciado | precisa de dados reais do Bella III |
| backup/restore, resiliência de conexão | não iniciado | **próximos, nesta ordem** (Victor confirmou 2026-09-10) |

## 3. Ambiente conhecido
Sem mudança (Docker local com falha, ENV-1; workspace OneDrive, ENV-5; ENV-6 recorrente). Execução hands-off desde 2026-09-10.

## 4. Evidências do M16 (resumo; detalhes em `QA_LEDGER.md`)
- `GET /v1/reports/daily?from=&to=` (`reports.view`, permissão já existente desde o M2): faturamento, ticket médio, mais vendidos, cancelamentos/descontos por operador. Sem tabela/migration nova — só consulta.
- Faturamento replica exatamente a regra de `items_total` do `computeBill` (M12) — item conta se não cancelado ou cancelado com `charge_on_cancel=true`.
- **Decisão consciente registrada**: sem cálculo automático de "dia operacional" (fuso + `business_day_cutoff`) — `from`/`to` explícitos, para não arriscar matemática de timezone sem biblioteca testada num relatório financeiro. Fica para quando existir uma tela real.
- **Regressão real pega pela própria CI**, não bug de produção: o teste usava uma janela de "últimos 60s", que capturou pedidos de OUTROS arquivos de teste no mesmo tenant (a suíte inteira roda em menos de um minuto) — corrigido usando uma janela mínima ao redor do próprio teste.
- **2 testes de integração novos** + **3 unitários novos**.

## 5. Decisões que não podem ser esquecidas
**ADR-025, ADR-030, ADR-031, ADR-032, ADR-033, ADR-034** (ver `DECISIONS.md`). Nenhum ADR novo no M16. **Padrão novo a levar adiante:** testes de integração que usam janelas de tempo relativas ("últimos N segundos") são arriscados quando o tenant é compartilhado entre arquivos de teste na mesma suíte — sempre capturar `from`/`to` imediatamente antes/depois das próprias ações do teste, nunca uma janela larga "por segurança".

## 6. Perguntas abertas para o Victor
Nenhuma pendência nova — Q7 respondida (só tela), ordem da Fase E confirmada.

## 7. Dependendo do Victor / pendências operacionais
- Reiniciar a máquina para tentar destravar o Docker Desktop (destravaria o Golden Journey com dados reais em vez de só via CI).
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).
- Quando quiser avançar M17 (estoque/CMV): trazer dados reais de insumos/receitas do Bella III.

## 8. Próximo passo exato
Executar backup/restore testado + runbook de incidentes (slot M18 do `ROADMAP.md`, renumeração não necessária — só reordenado na execução): dump/restore automatizado e testado de verdade (restaurar de um backup e provar que os dados batem), runbook de incidentes documentado. Depois: resiliência de conexão/reconexão (M20).
