# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-10 (M18 concluído e mergeado — sessão Sonnet 5, execução hands-off)
**Fase:** D completa (M8–M15) · Fase E em andamento — **Milestone concluído:** M18 Backup/restore testado + runbook de incidentes · **Próximo:** resiliência de conexão/reconexão (slot M20 do `ROADMAP.md`), ordem confirmada pelo Victor
**Branch:** `main` · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Commit:** `1cf638e` (merge PR #26, M18)
**CI:** verde nos **4 jobs** agora (lint·format·typecheck·unit, integração Postgres, build+smoke, **backup/restore testado — novo**). Sem regressão desta vez.

## 1. Estado funcional do produto
Fase D completa (ciclo operacional provado por Golden Journey). Fase E em andamento: M16 deu visibilidade financeira (relatório do dia); M18 deu uma forma testada de recuperar o banco de um desastre — não só documentada, provada automaticamente pela CI a cada mudança.

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| identity, catálogo, mesas/sessão, cardápio+carrinho | **funcionais (M1–M7)** | — |
| pedido, KDS, acompanhamento, cancelamento | **funcionais (M8–M11)** | — |
| ledger, taxas/couvert/desconto, caixa completo, fechar comanda | **funcionais (M12–M15)** | — |
| relatório do dia operacional | **funcional (M16)** | — |
| **backup/restore testado, runbook de incidentes** | **funcional (M18)** | provado na própria CI, não só documentado |
| impressão térmica | **sem data** | Victor confirmou: cozinha só tela por enquanto (Q7) |
| estoque/ficha técnica/CMV | não iniciado | precisa de dados reais do Bella III |
| degradação/reconexão endurecida (KDS/caixa) | não iniciado | **próximo** |

## 3. Ambiente conhecido
Sem mudança (Docker local com falha, ENV-1; workspace OneDrive, ENV-5; ENV-6 recorrente — aconteceu de novo no meio do M18, pego antes do push). Execução hands-off desde 2026-09-10.

## 4. Evidências do M18 (resumo; detalhes em `QA_LEDGER.md`)
- `packages/db/scripts/backup.sh`/`restore.sh`: `pg_dump -Fc --no-owner --no-privileges` / `pg_restore --clean --if-exists`. `pnpm db:backup` / `pnpm db:restore`.
- **Job novo `backup-restore` na CI**: semeia o banco, tira backup, cria um SEGUNDO banco Postgres do zero, restaura o dump nele, compara `count(*)` de `tenants`/`memberships` entre original e restaurado — prova real, passou de primeira.
- `docs/RUNBOOK_INCIDENTS.md` (novo): API fora do ar, Postgres inacessível, restaurar backup (mesmos comandos que a CI já provou), dado financeiro suspeito (nunca editar `ledger_entries` diretamente).
- Backups locais nunca commitados (`.gitignore`).

## 5. Decisões que não podem ser esquecidas
**ADR-025, ADR-030 a ADR-034** (ver `DECISIONS.md`). Nenhum ADR novo no M18. **Padrão novo:** qualquer capacidade de recuperação/infraestrutura só conta como "pronta" quando a CI prova o ciclo completo (backup→restore→comparação), nunca só "o script existe e não deu erro" — mesmo espírito da regra anti-falso-positivo do `CLAUDE.md`, aplicado a operações, não só a features de produto.

## 6. Perguntas abertas para o Victor
Nenhuma pendência nova.

## 7. Dependendo do Victor / pendências operacionais
- Reiniciar a máquina para tentar destravar o Docker Desktop (destravaria testes locais com dados reais em vez de só via CI).
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).
- Habilitar backup automático do Railway em produção quando o deploy real existir — o M18 é o fallback portátil, não substitui isso.
- Quando quiser avançar M17 (estoque/CMV): trazer dados reais de insumos/receitas do Bella III.

## 8. Próximo passo exato
Investigar o que já existe de reconexão/degradação (KDS já tem alguma lógica de SSE desde o M9) antes de planejar o Gate de Plano do próximo milestone — evitar redesenhar algo que já funciona. Ver `ACTIVE_PLAN.md` para o resultado dessa investigação e o plano.
