# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-10 (M6 concluído e mergeado, sessão Sonnet 5, execução hands-off)
**Fase:** B — Catálogo e operação básica · **Milestone concluído:** M6 Mesas, QR e sessão de mesa · **Próximo:** M7 Cardápio do cliente + carrinho (fim da Fase B, `ACTIVE_PLAN.md`)
**Branch:** `main` · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Commit:** `e323755` (merge PR #9, M6)
**CI:** verde nos 3 jobs (lint·format·typecheck·unit, integração Postgres — **60/60 testes**, build+smoke).

## 1. Estado funcional do produto
Além de identidade (M1–M3), shell/design (M4/M4.1) e catálogo (M5), agora existem mesas de verdade: um gerente cria áreas e mesas pelo admin, cada mesa recebe um código curto gerado pelo servidor (o que vira o QR físico), e um celular que "escaneia" esse código abre (ou entra n)uma sessão de mesa real — com um cookie próprio, isolado do login de staff. Ainda não existe cardápio visível para esse cliente (M7) nem PDF em lote dos QR Codes (cortado do M6, registrado).

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| identity (login, sessão, permissão, dispositivo, PIN) | **funcional (M1–M3)** | — |
| `apps/web` (shell, login, design system) | **funcional (M4/M4.1)** | — |
| catálogo (estações, categorias, produtos) | **funcional (M5)** | modificadores: API pronta, sem UI |
| **mesas, áreas, sessão de mesa** | **funcional (M6)** | admin CRUD + abertura pública de sessão |
| QR em PDF (lote, para imprimir) | não iniciado | cortado do M6, registrado |
| cardápio do cliente / carrinho | não iniciado | M7 |
| pedidos / KDS / caixa | não iniciado | Fase C/D |

## 3. Ambiente conhecido
Sem mudança (Docker local com falha, ENV-1; workspace OneDrive, ENV-5). **ENV-6** aconteceu de novo (6ª vez) — a conta ativa do `gh` segue voltando sozinha para `victorlins-dev` entre pushes; a checagem antes de cada push segue pegando 100% das vezes, nunca vazou. **Mudança de processo nesta sessão:** o Victor pediu operação hands-off — merge de PR após CI verde não espera mais confirmação, só bloqueios reais param a execução.

## 4. Evidências do M6 (resumo; detalhes em `QA_LEDGER.md`, decisão em `DECISIONS.md` ADR-031)
- Schema novo: `areas`/`tables`/`table_sessions`/`tabs` com RLS normal; **`guests` sem RLS, de propósito** (estende ADR-025 — resolver o cliente pelo cookie acontece antes de conhecer o tenant).
- **Bug real pego na REVISÃO, antes da CI rodar:** a primeira versão de abertura de sessão tentava capturar a violação do índice único parcial (só uma sessão aberta por mesa) e continuar na MESMA transação — o Postgres aborta o resto dela após qualquer violação de constraint. Corrigido com duas transações separadas.
- **60/60 testes de integração verdes** (53 de M1–M5 + 8 novos M6, um deles com **concorrência real via `Promise.all`**, não simulada): duas aberturas de sessão simultâneas na mesma mesa nunca criam duas sessões (confirmado por consulta independente ao banco), cada uma vira um convidado (`guest`) novo na mesma sessão.
- Cookie de sessão de mesa: opaco (hash no banco), sem biblioteca nova (`@fastify/cookie` não foi necessária) — mesmo modelo de confiança do token de dispositivo do M3.
- **Escopo cortado conscientemente:** geração de PDF em lote dos QR Codes fica para depois — a URL de cada mesa já aparece copiável na tela de admin, suficiente para o piloto.

## 5. Decisões que não podem ser esquecidas
**ADR-025** (`devices`/`pairing_codes` sem RLS). **ADR-028** (M4: lições de front). **ADR-029** (M4.1: redesenho por feedback). **ADR-030** (M5: `selfLookupPolicy`). **ADR-031** (M6: `guests` sem RLS; cookie opaco sem lib nova; concorrência exige transações separadas, nunca continuar após violação de constraint na mesma transação).

## 6. Perguntas abertas para o Victor
Sem mudança — ver `PRODUCT_CONTEXT.md §2`.

## 7. Dependendo do Victor / pendências operacionais
- Reiniciar a máquina para tentar destravar o Docker Desktop (destravaria testar o fluxo completo na UI localmente).
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).

## 8. Próximo passo exato
Executar o **M7** conforme `docs/ACTIVE_PLAN.md`: páginas públicas do cliente (`/{tenant}/m/{código}`), consumindo catálogo (M5) + sessão de mesa (M6), carrinho local, fim da Fase B.
