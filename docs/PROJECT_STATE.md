# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-10 (M20 concluído e mergeado — sessão Sonnet 5, execução hands-off)
**Fase:** D completa (M8–M15) · Fase E em andamento — **Milestone concluído:** M20 Degradação/reconexão endurecida · Fecha a lista de prioridades que o Victor pediu (relatório → backup/restore → resiliência de conexão)
**Branch:** `main` · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Commit:** `52d39d2` (merge PR #27, M20)
**CI:** verde nos 4 jobs (lint·format·typecheck·unit, integração Postgres, build+smoke, backup/restore). Sem regressão no M20.

## 1. Estado funcional do produto
Fase D completa (ciclo operacional provado por Golden Journey). Fase E: M16 (relatório do dia), M18 (backup/restore testado) e M20 (reconexão endurecida) concluídos — os três itens que o Victor priorizou explicitamente. Falta decidir o próximo passo.

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| identity, catálogo, mesas/sessão, cardápio+carrinho | **funcionais (M1–M7)** | — |
| pedido, KDS, acompanhamento, cancelamento | **funcionais (M8–M11)** | — |
| ledger, taxas/couvert/desconto, caixa completo, fechar comanda | **funcionais (M12–M15)** | — |
| relatório do dia operacional | **funcional (M16)** | — |
| backup/restore testado, runbook de incidentes | **funcional (M18)** | — |
| **banner de conexão no KDS, heartbeat visível, retry de rede, teste real de reconexão** | **funcional (M20)** | — |
| impressão térmica | **sem data** | Victor confirmou: cozinha só tela por enquanto (Q7) |
| estoque/ficha técnica/CMV | não iniciado | precisa de dados reais do Bella III |

## 3. Ambiente conhecido
Sem mudança (Docker local com falha, ENV-1; workspace OneDrive, ENV-5; ENV-6 recorrente). Execução hands-off desde 2026-09-10. Novo: `.claude/launch.json` criado (M20) para rodar `apps/web` via `preview_start` no Browser tool — útil para smoke test visual sem precisar de Postgres local.

## 4. Evidências do M20 (resumo; detalhes em `QA_LEDGER.md`)
- Heartbeat SSE virou evento nomeado (`event: heartbeat`) — era comentário, invisível ao `EventSource` do browser (achado real de uma investigação prévia, não hipotético).
- KDS: banner "sem conexão" (watchdog de 30s + reação imediata a `onerror`), some sozinho ao reconectar; polling de segurança continua funcionando por trás — banner é aviso, nunca bloqueio.
- `apiFetch`: retry com backoff só para falha de rede em `GET` (nunca em mutações — essas já têm `Idempotency-Key`; nunca em `authFetch`).
- **Teste real de desconectar→reconectar**: fecha a conexão de propósito (`AbortController`), gera um evento enquanto ninguém está conectado, reconecta com `Last-Event-ID` real, confirma que nada se perde nem duplica.
- **Testado num navegador real** (servidor fake local simulando queda de conexão): banner aparece e some exatamente como esperado, com screenshot em cada momento.
- `ARCHITECTURE.md` corrigido: canal único `orders` documentado como o que existe de verdade; canais múltiplos (`station`/`table-session`/`admin`) marcados como desenho futuro — divergência que existia desde o M9, nunca corrigida até agora.

## 5. Decisões que não podem ser esquecidas
**ADR-025, ADR-030 a ADR-034** (ver `DECISIONS.md`). Nenhum ADR novo no M20. **Lição a levar adiante:** um comentário SSE (`: texto`) é invisível ao `EventSource` do browser — qualquer sinal que o cliente precise reagir tem que ser um evento nomeado de verdade, nunca um comentário "decorativo". Vale para qualquer stream futuro.

## 6. Perguntas abertas para o Victor
**A lista de prioridades que ele deu para a Fase E está completa** (relatório → backup/restore → resiliência de conexão). Próximo passo real depende dele: seguir para M17 (estoque/CMV, precisa de dados reais de insumos/receitas do Bella III) ou outra prioridade fora do `ROADMAP.md` original.

## 7. Dependendo do Victor / pendências operacionais
- Reiniciar a máquina para tentar destravar o Docker Desktop.
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).
- Habilitar backup automático do Railway em produção quando o deploy real existir.
- Se quiser M17: trazer dados reais de insumos/receitas do Bella III.

## 8. Próximo passo exato
**Sem milestone ativo.** A lista de prioridades que o Victor deu para a Fase E está completa (M16, M18, M20). Perguntar a ele o que vem a seguir — M17 (estoque/CMV, precisa de dados reais dele) ou outra direção.
