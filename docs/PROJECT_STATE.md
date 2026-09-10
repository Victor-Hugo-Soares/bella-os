# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-10 (M10 concluído e mergeado — pedido de ponta a ponta fecha pela UI de verdade, sessão Sonnet 5, execução hands-off)
**Fase:** C — Pedido ponta a ponta · **Milestone concluído:** M10 Acompanhamento, expedição e chamados · **Próximo:** M11 Cancelamentos e pedido pela equipe (`ACTIVE_PLAN.md`) — último milestone da Fase C
**Branch:** `main` · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Commit:** `95103fe` (merge PR #17, M10)
**CI:** verde nos 3 jobs (lint·format·typecheck·unit, integração Postgres — **80/80 testes** em 14 arquivos, build+smoke).

## 1. Estado funcional do produto
O Golden Journey parcial (até "cliente acompanha") já fecha de ponta a ponta PELA UI, não só por trás: cliente escaneia QR → vê cardápio → monta carrinho → **envia o pedido de verdade** → acompanha o status → pode chamar garçom/pedir a conta. Staff vê o chamado e o que está pronto para entregar; cozinha vê e prepara em tempo real (M9); sessão não verificada tem caminho de aceite/rejeição. **Ainda falta:** cancelamento pela UI, pedido lançado pela equipe (API pronta desde M8, sem tela), e nada de pagamento/caixa (Fase D).

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| identity, catálogo, mesas/sessão, cardápio+carrinho, pedido, KDS | **funcionais (M1–M9)** | — |
| **acompanhamento do cliente + chamados + expedição** | **funcional (M10)** | envio de pedido agora realmente ligado à UI |
| cancelamento / pedido pela equipe (UI) | API pronta desde M8, sem UI | **M11** |
| caixa / pagamentos | não iniciado | Fase D |

## 3. Ambiente conhecido
Sem mudança (Docker local com falha, ENV-1; workspace OneDrive, ENV-5; ENV-6 recorrente). Execução hands-off desde 2026-09-10.

## 4. Evidências do M10 (resumo; detalhes em `QA_LEDGER.md`, decisão em `DECISIONS.md` ADR-034)
- `service_requests`, `PATCH /v1/orders/:id/{accept,reject}`, `GET /public/.../orders` (acompanhamento, polling 3s), `GET /v1/tickets/ready` (expedição).
- **Achado real de produto, o mais importante da sessão até agora:** o botão "Ver carrinho" do M7 nunca chamava a API de pedido do M8 — o ciclo só fechava tecnicamente (testes de API), nunca de fato pela tela do cliente. Corrigido com uma tela de carrinho real + envio.
- Dois achados menores de UI/QA corrigidos na mesma passada: status de item aparecendo cru na tela; duas telas de staff ficando em branco sem loading/erro.
- **80/80 testes de integração verdes** (73 de M1–M9 + 8 novos M10).
- **E2E manual real de ponta a ponta**: adicionar item → carrinho → enviar pedido de verdade → acompanhamento → chamar garçom → status muda sozinho via polling em poucos segundos (prova real do "<3s" do gate, não só lida no código).

## 5. Decisões que não podem ser esquecidas
**ADR-025, ADR-030, ADR-031** (RLS e exceções de tenant). **ADR-032** (M8: idempotência via `ON CONFLICT DO NOTHING`). **ADR-033** (M9: SSE via polling do outbox). **ADR-034** (M10: acompanhamento do cliente por polling, não SSE de guest; envio de pedido finalmente ligado ao carrinho — achado real).

## 6. Perguntas abertas para o Victor
Sem mudança — ver `PRODUCT_CONTEXT.md §2`.

## 7. Dependendo do Victor / pendências operacionais
- Reiniciar a máquina para tentar destravar o Docker Desktop (destravaria o teste de ponta a ponta com dados reais, incluindo o Golden Journey completo).
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).

## 8. Próximo passo exato
Executar o **M11** conforme `docs/ACTIVE_PLAN.md`: cancelar item antes/depois da produção (com permissão, motivo, `charge_on_cancel`), pedido lançado pelo garçom/caixa em nome da mesa (UI — API já existe desde o M8), transferência/junção de mesa. **Fecha a Fase C.**
