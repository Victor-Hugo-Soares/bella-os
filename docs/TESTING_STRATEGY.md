# Bella OS — Estratégia de Testes

> Complementa os gates do `BELLA_OS_AUTONOMOUS_HANDOFF.md` (§3–5). Regra central: **nenhuma evidência isolada prova nada**. Toda feature registra em `QA_LEDGER.md` quais frentes foram usadas.

## 1. Pirâmide e ferramentas

| Camada | Ferramenta | Onde | O que prova |
|--------|-----------|------|-------------|
| Unit (puro) | Vitest | `packages/domain`, `packages/contracts` | dinheiro, arredondamento, divisão, máquinas de estado, permissões, schemas |
| Integração API+DB | Vitest + `fastify.inject()` + Postgres real | `apps/api/test/integration` | rotas, transações, constraints, RLS, idempotência, concorrência, auditoria, eventos |
| Banco | SQL direto (cliente `pg`) nos testes | idem | policies RLS, índices parciais, triggers, revogação de UPDATE/DELETE no ledger |
| Componentes | Vitest + Testing Library | `apps/web` | componentes críticos (carrinho, seletor de modificadores, teclado de PIN) |
| E2E | Playwright (Chromium mobile + desktop) | `apps/web/e2e` | jornadas reais contra API + banco de teste |
| Contrato | zod em `contracts` compartilhado + teste que valida fixtures de resposta | `packages/contracts` | API e web falam a mesma língua |
| Segurança | testes de negação por papel/tenant/sessão; scan de segredos (gitleaks no CI); `pnpm audit` | CI | G6 |
| Carga leve | script k6 ou autocannon (Fase C+) | `tools/load` | KDS com 50–100 tickets, 30 clientes simultâneos |
| Caos | testes que derrubam SSE, atrasam DB, matam processo no meio da transação (Fase E) | `apps/api/test/chaos` | reconexão, idempotência, atomicidade |
| Smoke produção | script `tools/smoke` contra staging/production com tenant de teste | pós-deploy | `/health`, `/ready`, login, cardápio público |
| Backup/restore | job + teste de restore em banco vazio (Fase E, antes de F) | runbook | G9 |

## 2. Convenções

- Banco de testes: `bella_test`; cada arquivo de integração roda em **schema próprio** ou usa `BEGIN … ROLLBACK` por teste via helper `withTestDb()`. Nunca compartilhar estado entre arquivos.
- Seed reproduzível: `packages/db/seed/` com dois tenants (`bella`, `demo`), papéis padrão, um usuário por papel, 20 mesas, catálogo fictício com pizza meio a meio, bebida no bar e prato na cozinha.
- Fixtures de ator: `asOwner(tenant)`, `asCashier(tenant)`, `asKitchenDevice(tenant, station)`, `asGuest(tableSession)`.
- Todo teste crítico tem **par negativo** (mesma ação sem permissão/tenant errado/sessão errada).
- Testes de concorrência usam `Promise.all` com N requisições idênticas/conflitantes e verificam **no banco** o resultado (contagem de linhas, saldo).
- Nada de `sleep` arbitrário: aguardar por condição (evento SSE recebido, linha no banco).
- Dados nunca reais. Nomes fictícios; e-mails `@example.com`.

## 3. Frentes independentes por tipo de mudança (mínimo)

| Tipo | Frentes obrigatórias |
|------|----------------------|
| Regra pura | unit + uso em integração |
| Endpoint normal | integração + inspeção do banco **ou** E2E |
| Endpoint crítico (dinheiro, comanda, auth, permissão, cancelamento, estoque) | integração + inspeção SQL independente + teste negativo + (E2E ou concorrência) |
| UI | E2E + inspeção visual (screenshot em 3 larguras) + estados vazio/erro/loading |
| Realtime | integração (evento no outbox) + E2E (tela atualiza) + reconexão |
| Migration | aplicar em banco vazio + aplicar sobre banco com seed anterior + `drizzle-kit check` |

## 4. Golden Journey ("uma noite no Bella")

Teste E2E principal, executado por completo a partir da Fase D e parcialmente antes. Roda com tenant `demo`, dois celulares (contextos Playwright mobile), um KDS por estação, um caixa.

1. Gerente abre o caixa com fundo de troco.
2. Cliente A escaneia QR da mesa 12 (abre URL) → sessão criada, não verificada.
3. Cliente A vê cardápio, abre pizza, escolhe meio a meio (2 sabores), adiciona observação; adiciona refrigerante; envia pedido.
4. Salão recebe "confirmar mesa 12" → confirma. Pedido aceito. **Verificar:** 1 pedido, 2 tickets (pizzaria e bar), 1 `item_charge` por item, evento outbox único.
5. KDS Bar marca refrigerante preparando → pronto. KDS Pizzaria inicia pizza. Cliente A vê status e estimativa mudarem.
6. Cliente B (segundo celular) escaneia a mesma mesa → entra na sessão; pede um prato (cozinha). Duplo toque em Enviar → **um** pedido.
7. Expedição vê refrigerante pronto → marca entregue.
8. Cliente A cancela? Não: garçom cancela o prato de B antes da produção com motivo → estorno no ledger; KDS Cozinha remove ticket.
9. Pizza pronta → entregue. Cliente A chama garçom → chamado aparece e é atendido.
10. Cliente pede a conta → sessão `closing`; caixa abre a comanda; taxa de serviço opcional mantida; desconto de R$ 5,00 com PIN de gerente.
11. Pagamento parcial em PIX + restante em dinheiro com troco → saldo 0 → comanda fecha → sessão fecha → mesa livre (novo scan cria nova sessão).
12. Fechamento de caixa: esperado por método bate com pagamentos; operador informa contado com R$ 2,00 de diferença → divergência registrada com motivo.
13. Dashboard do dia operacional mostra faturamento, ticket médio, item mais vendido, 1 cancelamento, 1 desconto.
14. **Auditoria:** consulta SQL independente confirma: ledger soma zero após pagamentos; `audit_log` tem login, confirmação de mesa, cancelamento, desconto, fechamento; nenhum `UPDATE/DELETE` no ledger; `domain_events` sem duplicatas por `id`.

Cada passo tem asserções na UI **e** no banco. O teste falha se qualquer contagem divergir.

## 5. Cenários obrigatórios de falha (a partir da Fase C)

- Rede do cliente cai no envio; app faz retry com a mesma chave → 1 pedido.
- SSE do KDS derrubado por 40 s → banner "sem conexão"; ao voltar, nenhum ticket perdido nem duplicado.
- Processo da API morto no meio de `POST /orders` (teste com `pg` que aborta a conexão) → nenhum pedido parcial.
- Item esgotado entre carrinho e envio → 422 legível.
- Token de sessão de mesa de outra mesa → 403.
- Cookie de staff de tenant A em rota do tenant B → 403 e nada no banco de B.
- PIN errado 5× → bloqueio temporário registrado.

## 6. CI (GitHub Actions)

Jobs: `lint` · `typecheck` · `unit` · `integration` (Postgres 16 service container, `pnpm db:migrate && pnpm test:integration`) · `build` · `e2e` (Playwright, após build, com API e web em processo) · `secrets` (gitleaks). `main` protegido: só entra com CI verde. E2E pode ser `continue-on-error` até a Fase B ter telas; depois é bloqueante.

## 7. Registro de evidência

Toda entrada em `QA_LEDGER.md` segue:
```
### <data> — <milestone/feature> — Gate Gx — PASS|FAIL
Frentes: [integração: arquivo/teste] [SQL: consulta] [E2E: spec] [visual: screenshot] [negativo: …]
Observações / falhas encontradas e corrigidas
```
