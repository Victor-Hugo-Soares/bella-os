# Bella OS — Roadmap Técnico por Milestones

> Cada milestone é pequeno, tem gate de saída próprio e critérios de aceite verificáveis por mais de uma frente. Sonnet executa um milestone por vez: plano em `ACTIVE_PLAN.md` → Gate de Plano → implementar → provar → registrar em `QA_LEDGER.md` → checkpoint Git → próximo. Fases seguem o handoff (A–G).

## Fase A — Fundação

| Milestone | Entrega | Gate de saída (resumo) |
|-----------|---------|------------------------|
| **M0 — Bootstrap** (feito pelo Fable nesta sessão) | monorepo, tooling, CI, docs, API com `/health`, compose do Postgres, repositório no GitHub | `pnpm install && pnpm lint && pnpm typecheck && pnpm test` verdes local e na CI; push feito para `Victor-Hugo-Soares/bella-os` |
| **M1 — Banco, tenant e isolamento** | `packages/db` com migrations: `tenants`, `tenant_settings`, `organizations`, `users`(mínimo), `roles`, `role_permissions`, `memberships`, `platform_admins`, `audit_log`, `domain_events`, `idempotency_keys`, `jobs`; RLS ativada; helper `withTenant(tx, tenantId)`; seed com 2 tenants (Bella + "Restaurante Demo"); testes de integração de isolamento | migration limpa em banco vazio; teste de vazamento cruzado falha como esperado (positivo + negativo); inspeção SQL independente das policies; `pnpm db:reset && pnpm test:integration` verde |
| **M2 — Auth staff, papéis, permissões** | Better Auth integrado; login/logout; `memberships`; `requirePermission`; papéis seed; endpoints `GET /v1/me`, `POST /v1/auth/*`; auditoria de login | teste positivo e negativo de permissão por API; cookie httpOnly verificado; senha nunca em log; teste de usuário em 2 tenants |
| **M3 — Dispositivos, PIN e observabilidade mínima** | pareamento de dispositivo, token escopado, PIN de operador com bloqueio; pino com request_id/tenant_id; `/ready`; envelope de erro padronizado; rate limit em rotas públicas | pareamento E2E via API; PIN errado 5× bloqueia; logs mostram correlação; erro 500 forjado retorna envelope com `request_id` |
| **M4 — Web: shell, login e design system** | `apps/web` Next.js com tokens do `FRONTEND_GUIDELINES.md`, layout admin, tela de login, proteção de rota, TanStack Query configurado | Playwright: login válido/inválido; inspeção visual mobile e desktop; fontes carregadas (`document.fonts.check`) |

**Gate de saída da Fase A:** setup do zero em máquina limpa (documentado no runbook) + CI verde + isolamento de tenant provado + login e permissões provados + docs atualizados.

## Fase B — Catálogo e operação básica

| Milestone | Entrega | Gate |
|-----------|---------|------|
| **M5 — Catálogo (API + admin)** | estações, categorias, produtos, grupos de modificadores, disponibilidade, ordenação; CRUD admin | validação zod; permissão `catalog.manage` positiva/negativa; produto indisponível não aparece no cardápio público; UI admin com estados vazio/erro/loading |
| **M6 — Mesas, QR e sessão de mesa** | áreas, mesas, `qr_code`, PDF dos QRs, `POST /public/{tenant}/tables/{code}/session` com cookie escopado, `guests`, modos de confirmação | manipular código na URL não dá acesso a outra sessão; índice parcial impede 2 sessões abertas (teste concorrente); PDF gerado e legível (scan com celular real) |
| **M7 — Cardápio do cliente + carrinho** | páginas públicas mobile-first (categorias, produto, modificadores, observações, chips), carrinho em localStorage com `Idempotency-Key` pré-gerada, consumo da sessão | Lighthouse mobile; teste em 3 larguras; item indisponível some ao vivo (SSE `catalog.updated`); acessibilidade básica |

**Gate da Fase B:** cliente mobile monta pedido válido (sem enviar ainda); tenant/mesa não manipuláveis; catálogo vem do servidor; indisponibilidade respeitada.

## Fase C — Pedido ponta a ponta

| Milestone | Entrega | Gate |
|-----------|---------|------|
| **M8 — Criação idempotente de pedido** | `POST /v1/orders` (cliente e staff), snapshot de preço, roteamento em tickets, `order_events`, ledger `item_charge`, eventos outbox, `price_changed`/`ITEM_UNAVAILABLE` | duplo envio → 1 pedido (API + banco + evento único); retry com corpo diferente → 409; total reconstruído independente; 3 frentes (crítico) |
| **M9 — KDS em tempo real** | SSE `/v1/stream`, tela KDS por estação, iniciar/pronto/recall, esgotar item, alerta de cancelamento, polling de segurança, reconexão | pedido aparece na estação certa em < 2 s; reconexão não duplica; dois dispositivos bumpando → estado único; fila com 50 tickets usável |
| **M10 — Acompanhamento, expedição e chamados** | status por item no cliente, estimativa em faixa, lista de prontos para entrega, "entregue", chamar garçom / pedir conta, confirmação de sessão não verificada | cliente vê mudança em < 3 s; ETA rotulada como estimativa; chamado aparece no salão; pedido de sessão não verificada aguarda e é aceito/rejeitado |
| **M11 — Cancelamentos e pedido pela equipe** | cancelar antes/depois da produção com permissão, motivo e `charge_on_cancel`; pedido lançado pelo garçom/caixa em nome da mesa; transferência de mesa e junção | negação sem permissão; ledger coerente nos dois tipos de cancelamento; KDS alerta; transferência com pedido simultâneo cai na comanda certa (teste concorrente) |

**Gate da Fase C:** Golden Journey parcial (até "cliente acompanha") verde em E2E + banco + logs.

## Fase D — Caixa e financeiro

| Milestone | Entrega | Gate |
|-----------|---------|------|
| **M12 — Ledger, taxas, couvert, descontos** | cálculo de totais no servidor, taxa opcional/obrigatória, couvert, desconto com permissão, `GET /tabs/{id}/bill` | tabela de casos de centavos; reconciliação ledger × itens; desconto sem permissão negado; 3 frentes |
| **M13 — Sessão de caixa e pagamentos** | abrir caixa, registrar pagamentos multi-forma/parciais/troco, estorno, sangria/suprimento, fechar comanda | dois pagamentos concorrentes; overpayment; comanda fecha só com saldo 0 e sem item em produção; pagamento fora de caixa aberto negado |
| **M14 — Fechamento de caixa e relatórios básicos** | esperado × contado por método, divergência com motivo, relatório do dia operacional (faturamento, ticket médio, mais vendidos, cancelamentos/descontos por operador) | fechamento reconstruído automaticamente bate com ledger; divergência registrada; relatório bate com consulta SQL independente |
| **M15 — Divisão de conta e Golden Journey completa** | dividir por igual / por itens / por pessoa (guests); E2E da noite inteira | soma das partes == total; Golden Journey completa verde (ver `TESTING_STRATEGY.md`) |

**Gate da Fase D:** totais reconstruíveis; permissões e concorrência testadas; fechamento sem conta manual.

## Fase E — Operação robusta
~~M16 impressão (agente local + fila)~~ **sem data — Victor confirmou em 2026-09-10 que por enquanto é só tela (Q7, `PRODUCT_CONTEXT.md §2`)**; slot reaproveitado para **M16 — Relatório do dia operacional** (faturamento, ticket médio, mais vendidos, cancelamentos/descontos por operador — escopo que já estava previsto no M14 original e não foi entregue, `KNOWN_ISSUES.md` R-16) · M17 estoque/ficha técnica/CMV (precisa de dados reais do Bella III) · M18 backup/restore testado + runbook de incidentes · M19 relatórios avançados (o que sobrar além do M16) · M20 degradação/reconexão endurecida e testes de caos.

## Fase F — Produção Bella
M21 parametrização real (cardápio, mesas, equipe, taxas) · M22 dispositivos reais e Wi-Fi/4G · M23 piloto assistido (uma noite) · M24 checklist de abertura/fechamento e monitoramento.

## Fase G — SaaS
M25 onboarding de tenant · M26 tema/white-label · M27 pagamento pelo celular (PIX) · M28 IA de fotos · M29 métricas SaaS.

## Regras de sequência
- Não iniciar milestone N+1 com gate de N em FAIL.
- Milestones críticos (M8, M11, M12, M13, M14, M15) exigem 3 frentes de evidência.
- Ao terminar cada milestone: `PROJECT_STATE.md`, `QA_LEDGER.md`, `ACTIVE_PLAN.md` (próximo), commit em branch `claude/<milestone>`, merge em `main` após CI verde.
