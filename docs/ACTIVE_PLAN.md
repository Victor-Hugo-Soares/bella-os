# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `docs/FRONTEND_GUIDELINES.md` → `DOMAIN_MODEL.md` §1.4/§2 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M5 (catálogo) está mergeado em `main` (commit `0919719`, PR #7, CI verde: 53/53 testes). Este plano do M6 assume isso como ponto de partida.

## Milestone atual: **M6 — Mesas, QR e sessão de mesa** (Fase B)

### Problema
O catálogo (M5) já existe, mas não há como um cliente físico chegar a ele: não existem mesas, não existe QR Code, não existe o conceito de "sessão de mesa" (quem está sentado ali agora, desde quando, com qual comanda). M6 constrói essa ponte física↔digital. Ainda não é o cardápio do cliente em si (isso é M7) — é a infraestrutura que o M7 vai precisar (uma URL válida por mesa, uma sessão identificável, uma comanda para lançar pedidos).

### Resultado esperado
1. `areas` (salão, varanda) e `tables` (número/label, capacidade, `qr_code` único e não sequencial) — CRUD admin, mesmo padrão do M5 (`catalog.manage` reaproveitado ou nova chave `tables.manage`, já existe em `permissions.ts`).
2. `table_sessions`: abrir sessão a partir do QR (`POST /public/{tenant}/tables/{code}/session`), com **índice único parcial** garantindo só uma sessão não-`closed` por mesa (`DOMAIN_MODEL.md §1.4`). Resposta seta um cookie **escopado à sessão de mesa** (não é o cookie de staff do Better Auth — é um token de sessão de mesa assinado, `httpOnly`).
3. `guests`: um registro por celular que entrou na sessão (permite "quem pediu o quê" mais adiante).
4. `tabs`: criada junto com a sessão (1 comanda padrão por sessão, MVP; múltiplas comandas por mesa é enhancement, não bloqueia M7).
5. Geração de PDF com os QR Codes de todas as mesas de um tenant (para o Victor imprimir e colar nas mesas do Bella III de verdade).
6. Modos de confirmação (`tenant_settings.customer_order_mode`) só armazenados/lidos neste milestone — a lógica de "pedido aguarda confirmação do salão" é do M8 (pedidos), aqui só a sessão nasce com `verified_at = null` quando aplicável.

### Arquivos envolvidos
- `packages/db/src/schema/tables.ts` (novo): `areas`, `tables`, `table_sessions`, `tabs`, `guests`.
- `packages/contracts/src/tables.ts` (novo): schemas Zod.
- `apps/api/src/modules/tables/{service,routes}.ts` (admin: CRUD de área/mesa) + `apps/api/src/modules/tables/public-routes.ts` (`POST /public/{tenant}/tables/{code}/session`, sem `catalog.manage` — rota do cliente, sem sessão de staff).
- `packages/db/src/pdf/qr-codes.ts` ou `apps/api`: geração do PDF (biblioteca a pesquisar e confirmar antes de codar — regra 12; candidatos: `pdf-lib`, `@react-pdf/renderer`; QR em si via alguma lib de geração de QR SVG/PNG, também a confirmar).
- `apps/web/src/app/(admin)/admin/tables/**`: admin de área/mesa + botão "baixar PDF dos QRs".
- Testes: `apps/api/test/integration/tables.test.ts`.

### Riscos
- **Cookie de sessão de mesa é uma credencial nova, diferente da sessão de staff (Better Auth)** — precisa de desenho próprio (assinatura, expiração, escopo por `table_session_id`), não é reaproveitável. Pesquisar como assinar/verificar (candidato: `@fastify/cookie` com `signed: true`, ou JWT curto) antes de codar — regra 12.
- **Concorrência**: dois QR scans na mesma mesa ao mesmo tempo não podem criar duas sessões — o índice único parcial resolve no banco, mas o código precisa tratar a violação de unicidade como "sessão já existe, devolver a existente" (idempotente do ponto de vista do cliente), não como erro 500.
- **PDF real**: gerar não basta — precisa ser testado escaneando de verdade com um celular (Claude Browser tool não escaneia QR; usar geração + decodificação programática como prova, e pedir ao Victor uma conferência visual/física como segunda frente quando fizer sentido).
- **`qr_code` não sequencial**: usar token aleatório curto (não UUID completo — mais amigável para URL), pesquisar geração antes de codar.

### Testes (3 frentes — **crítico**: tenant/sessão, ver regra 2 do CLAUDE.md)
1. Integração (Postgres real, CI): abrir sessão via código real; manipular o código na URL não dá acesso a sessão de outra mesa/tenant; duas aberturas concorrentes na mesma mesa (teste de concorrência real, não só lógico) resultam em uma sessão só; encerrar sessão libera a mesa para nova sessão.
2. Inspeção independente: cookie de sessão de mesa não contém dado sensível em claro (se for JWT, conferir claims; se opaco+hash, mesmo padrão do device token do M3).
3. PDF: gerado com N mesas reais do seed, decodificado programaticamente (biblioteca de leitura de QR) confirmando que cada QR aponta para a URL certa da mesa certa.

### Critérios de aceite
- [ ] Escanear (ou decodificar) o QR de uma mesa abre uma sessão válida só daquela mesa.
- [ ] Duas sessões simultâneas na mesma mesa é impossível (índice parcial + teste de concorrência real).
- [ ] PDF gerado e decodificado corretamente para todas as mesas de um tenant.
- [ ] `pnpm check`/`pnpm build` verdes; CI remota verde.
- [ ] Docs atualizados; `ACTIVE_PLAN.md` reescrito para M7 (cardápio do cliente + carrinho, fim da Fase B).

### Gate de Plano (a responder no início da execução do M6)
Problema entendido · solução menor não existiria · afeta segurança de sessão (nova credencial, tratar como crítico) · risco principal é concorrência + desenho de cookie novo · prova por integração real + concorrência real + PDF decodificado · rollback trivial (schema novo) · multi-tenant preservado (RLS + `qr_code` resolvido dentro do tenant certo, nunca vazando entre tenants).

## Próximos milestones (resumo; detalhes em `ROADMAP.md`)
M7 cardápio do cliente + carrinho (fim da Fase B) → Fase C: M8 criação idempotente de pedido (primeiro milestone crítico com 3 frentes obrigatórias por padrão).
