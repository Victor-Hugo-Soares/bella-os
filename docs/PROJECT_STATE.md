# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-10 (M15 concluído e mergeado — **Fase D completa** — sessão Sonnet 5, execução hands-off)
**Fase:** D completa (M8–M15) · **Próxima fase:** E — Operação robusta (M16–M20), primeiro milestone depende de informação do Victor (ver §6)
**Branch:** `main` · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Commit:** `990dc83` (merge PR #24, M15)
**CI:** verde nos 3 jobs (lint·format·typecheck·unit, integração Postgres — `tab-close.test.ts` + `golden-journey.test.ts` novos, 8 testes; build+smoke).

## 1. Estado funcional do produto — Fase D completa
O Bella OS agora cobre o ciclo operacional inteiro de um restaurante, ponta a ponta, provado por um teste de Golden Journey real contra Postgres: cliente escaneia QR → monta e envia pedido (idempotente) → cozinha prepara num KDS de verdade → cliente acompanha e pede a conta → equipe consulta o total (taxa de serviço automática) e aplica desconto → caixa abre sessão, cobra o valor exato, fecha a comanda → caixa fecha o turno com contagem por forma de pagamento, sem divergência escondida. **O ledger inteiro fecha em exatamente 0** ao final do ciclo — é a prova mais forte que existe hoje de que o sistema não perde, duplica nem erra dinheiro.

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| identity, catálogo, mesas/sessão, cardápio+carrinho | **funcionais (M1–M7)** | — |
| pedido (criação, idempotência, ledger `item_charge`) | **funcional (M8)** | — |
| KDS em tempo real | **funcional (M9)** | — |
| acompanhamento, chamados, expedição | **funcional (M10)** | — |
| cancelamento de item, pedido pela equipe | **funcional (M11)** | transferência de mesa adiada, registrado |
| ledger completo (taxa, couvert, desconto), `GET /bill` | **funcional (M12)** | sem UI própria — só API |
| sessão de caixa, pagamento (registrar/estornar) | **funcional (M13)** | sem UI própria — só API |
| sangria/suprimento, fechamento de caixa (contagem/divergência) | **funcional (M14)** | sem UI própria — só API; relatório do dia operacional NÃO feito (lacuna real, `KNOWN_ISSUES.md` R-16) |
| **fechar comanda de fato, divisão de conta, Golden Journey** | **funcional (M15)** | sem UI própria — só API |
| impressão térmica, estoque/CMV, backup/restore, relatórios avançados, degradação | não iniciado | **Fase E (M16–M20)** |

## 3. Ambiente conhecido
Sem mudança (Docker local com falha, ENV-1; workspace OneDrive, ENV-5; ENV-6 recorrente). Execução hands-off desde 2026-09-10.

## 4. Evidências do M15 (resumo; detalhes em `QA_LEDGER.md`)
- `tab_closures` (schema novo, migration `0012`): fotografia final da comanda, `tab_id` único.
- `POST /v1/tabs/:id/close`: só fecha com saldo 0 (`CONFLICT` senão); idempotente por construção (fechar de novo devolve a mesma fotografia, nunca duplica).
- `GET /v1/tabs/:id/split`: divide o saldo restante entre N pessoas, puramente informativo, reaproveita `splitEvenly` do M0.
- Permissão nova `tabs.close` — primeira chave nova desde o M2 (nenhuma existente cobria "fechar comanda" semanticamente).
- **Golden Journey**: um único teste de integração percorrendo cliente→cozinha (KDS real)→salão→caixa→fechamento numa mesma comanda; o ledger inteiro soma exatamente 0 ao final, consulta independente ao banco.
- **8 testes de integração novos**, CI verde de primeira (sem regressão desta vez).

## 5. Decisões que não podem ser esquecidas
**ADR-025, ADR-030, ADR-031** (RLS e exceções de tenant). **ADR-032** (M8). **ADR-033** (M9). **ADR-034** (M10). Nenhum ADR novo M11–M15 — decisões de cada milestone ficam no respectivo Gate de Plano (`QA_LEDGER.md`). **Padrão consolidado ao longo da Fase D, vale para qualquer milestone futuro:** toda mutação de dinheiro roda dentro da MESMA transação que lê o saldo que a valida (nunca duas transações separadas — é o que torna `OVERPAYMENT`/concorrência realmente seguros); toda ação crítica é idempotente por construção (índice único ou checagem de existência), nunca por "tentar não chamar duas vezes"; testes de integração que precisam de um recurso exclusivo (sessão de caixa, registrador) devem limpar estado residual próprio no início, nunca assumir um tenant "livre".

## 6. Perguntas abertas para o Victor
**Nova, antes de planejar a Fase E:** os primeiros milestones da Fase E (M16 impressão térmica, M17 estoque/ficha técnica/CMV) dependem de informação exclusiva do restaurante que ainda não temos — Q7 (`PRODUCT_CONTEXT.md §2`: a cozinha quer papel além da tela do KDS? qual impressora?) e dados reais de insumos/receitas para o M17 fazer sentido. **Isso não bloqueia M18 (backup/restore) nem M20 (degradação/reconexão)**, que são técnicos e podem seguir sem input do Victor — mas o Sonnet parou aqui, no fim natural da Fase D, para perguntar qual desses cinco milestones (M16–M20) o Victor quer priorizar, em vez de adivinhar. Ver também R-16 em `KNOWN_ISSUES.md` (relatório do dia operacional, previsto no M14 original, não implementado).

## 7. Dependendo do Victor / pendências operacionais
- Reiniciar a máquina para tentar destravar o Docker Desktop (destravaria o Golden Journey com dados reais em vez de só via CI).
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).
- **Decidir a ordem da Fase E** (ver §6) e, se quiser M16/M17 logo, responder Q7 e trazer dados reais de cardápio/insumos.

## 8. Próximo passo exato
**Fase D está completa.** Próximo passo depende de decisão do Victor sobre a Fase E (§6) — não é um bloqueio técnico, é uma escolha de produto/prioridade que vale confirmar antes de gastar um milestone inteiro na direção errada.
