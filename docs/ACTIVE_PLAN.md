# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `docs/FRONTEND_GUIDELINES.md` → `DOMAIN_MODEL.md` §1.3/§2 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M4 (web shell, login) e M4.1 (refinamento visual por feedback do Victor) estão mergeados em `main` (commit `ba3d83f`). Este plano do M5 assume isso como ponto de partida — primeiro milestone da **Fase B**.

## Milestone atual: **M5 — Catálogo (API + admin)** (Fase B)

### Problema
Até aqui só existe identidade (quem loga, quem pode o quê). Não existe cardápio nenhum — nenhuma tabela de produto, categoria, estação de produção ou modificador. Sem catálogo não há o que vender nem o que a cozinha produz. M5 cria essa base: schema + API com permissão (`catalog.manage`) + uma tela de admin para gerenciar o cardápio. Cliente final (Fase B, M7) e KDS (Fase C) consomem esse mesmo catálogo depois — por isso o modelo de dados precisa estar certo agora.

### Escopo desta fatia (decisão registrada)
`DOMAIN_MODEL.md §1.3` lista 7 tabelas de catálogo. Para não estourar um milestone só, a fatia do M5 é:
- **Com CRUD completo (API + admin UI):** `stations`, `categories`, `products` (sem imagem ainda).
- **Com CRUD de API + testes, sem UI ainda (adiado, documentado):** `modifier_groups`, `modifiers`, `product_modifier_groups` — API pronta para o M6/M7 consumirem e para uma tela de admin dedicada entrar depois, sem exigir migração nova.
- **Fora do M5, reservado no domínio, não modelado ainda:** `product_images` (upload/armazenamento é um problema à parte — Storage, variantes, IA) e `pizza_flavor_groups` (meio a meio depende de `modifier_groups` já existir e de decisão de produto sobre precificação, `DOMAIN_MODEL.md §4`).

Justificativa: produto sem imagem e sem modificador já é um cardápio navegável e editável de ponta a ponta (prova real de que a arquitetura de catálogo funciona); imagem e meio-a-meio são aditivos, não bloqueiam M6 (mesas) nem M7 (cardápio do cliente sem modificador ainda é útil).

### Resultado esperado
1. **Schema** (`packages/db/src/schema/catalog.ts`): `stations`, `categories`, `products`, `modifier_groups`, `modifiers`, `product_modifier_groups`. Todas com `tenant_id` + RLS (`tenantIsolationPolicy`, ADR-021) — são tabelas de negócio normais, sem o caso especial do ADR-025. Migration gerada via `drizzle-kit generate`, `drizzle-kit check` limpo.
2. **Validação Zod** em `packages/contracts` (schemas de entrada compartilháveis entre API e, futuramente, o front) para criar/atualizar cada entidade.
3. **API REST sob `/v1/catalog/*`**, protegida por `requirePermission(db, auth, 'catalog.manage')` para mutação; leitura (`GET`) também exige a permissão neste milestone (não existe cardápio público ainda — isso é M7, com sua própria rota `/public/*` e sua própria regra de "só mostra o disponível").
   - `stations`: GET lista, POST cria, PATCH atualiza, DELETE (soft: `is_active=false`, nunca hard-delete — produto referencia estação).
   - `categories`: idem, mais reordenação (`sort_order`).
   - `products`: idem, mais toggle rápido de `is_available` (é o campo que o KDS vai mudar no futuro — a rota já nasce separada da edição geral, `PATCH /v1/catalog/products/:id/availability`).
   - `modifier_groups`, `modifiers`, `product_modifier_groups`: CRUD básico (sem reordenação fina neste milestone).
4. **Admin UI** (`apps/web/src/app/(admin)/admin/catalog`): uma tela por entidade com CRUD completo para estações/categorias/produtos (lista + criar + editar + desativar), com os 4 estados obrigatórios (`FRONTEND_GUIDELINES.md §7`: loading/vazio/erro/sucesso). Precisa de `X-Tenant-Id` — como a Fase B ainda não tem seletor de tenant na UI (isso é produto de M5+, ver pendência abaixo), a store do tenant ativo é o próprio `/v1/me` combinado com uma lista de tenants do usuário; **decisão**: para não bloquear o milestone, o front assume o primeiro tenant retornado por uma nova rota `GET /v1/me/tenants` (lista tenants onde o usuário tem membership ativa) — suficiente para um usuário com um tenant só (o caso real do Bella III agora); múltiplos tenants por usuário fica para quando existir de verdade (Fase G, SaaS).
5. **Sem imagem, sem cardápio público, sem modificador na UI** — registrado como escopo, não esquecimento (seção acima).

### Arquivos envolvidos
- `packages/db/src/schema/catalog.ts` (novo) + `packages/db/src/schema/index.ts` (export).
- Migration gerada em `packages/db/drizzle/`.
- `packages/contracts/src/catalog.ts` (novo): schemas Zod de entrada/saída.
- `apps/api/src/modules/catalog/{service,routes}.ts` (novo, mesmo padrão de `modules/identity/devices`).
- `apps/api/src/modules/identity/routes.ts` ou novo `modules/identity/tenants/routes.ts`: `GET /v1/me/tenants`.
- `apps/api/src/app.ts`: registrar `catalogRoutes`.
- `apps/web/src/app/(admin)/admin/catalog/**`: páginas de estações/categorias/produtos.
- `apps/web/src/lib/api.ts`: sem mudança estrutural, só novos usos de `apiFetch`.
- Testes: `apps/api/test/integration/catalog.test.ts`.

### Riscos
- **Seletor de tenant inexistente na UI** é uma lacuna de produto maior que o M5 (relevante a partir do momento em que existir mais de um tenant por usuário de verdade) — mitigado pela decisão acima (primeiro tenant), registrado em `PRODUCT_NOTES.md` como pendência de UX para quando o SaaS multi-tenant por usuário existir.
- **Reordenação (`sort_order`)** pode virar drag-and-drop custoso; MVP usa um campo numérico editável, sem D&D — suficiente para provar a coluna funciona; D&D é melhoria de UX adiável.
- **`DELETE` real vs. soft-delete**: produto/categoria/estação podem já estar referenciados (por outro produto, por um pedido futuro). Decisão: nunca DELETE físico nessas tabelas neste milestone (nem tabela nenhuma de negócio, aliás — é o padrão do projeto desde `orders`/`payments` no domínio); "excluir" na UI = `is_active=false`.

### Testes (2 frentes — mudança normal; catálogo não é dinheiro/comanda/autenticação/tenant crítico, é dado estruturado com permissão)
1. Integração (Postgres real, CI): CRUD de cada entidade via API real; permissão positiva (`owner`/`manager` conseguem) e negativa (`waiter`/`kitchen` não conseguem `catalog.manage`); isolamento entre tenants (Bella não vê/edita produto do Demo); toggle de disponibilidade; soft-delete não remove a linha.
2. UI real (browser): fluxo completo criar estação → criar categoria → criar produto vinculado, com os 4 estados (loading/vazio/erro/sucesso) inspecionados de verdade; visual em duas larguras.

### Critérios de aceite
- [ ] Migration limpa (`drizzle-kit check`), RLS ativa nas 6 tabelas, testada com isolamento positivo/negativo.
- [ ] `catalog.manage` positivo (`owner`) e negativo (`waiter`) provados via API real.
- [ ] Produto criado aparece na listagem do admin; desativado some da listagem padrão (mas continua no banco).
- [ ] `pnpm check`/`pnpm build` verdes no monorepo inteiro; CI remota verde.
- [ ] Docs atualizados; `ACTIVE_PLAN.md` reescrito para M6 (mesas/QR).

### Gate de Plano (respondido em 2026-09-09)
Problema entendido (catálogo é pré-requisito de tudo que vem depois na Fase B/C) · solução menor não existiria (precisa de schema real com RLS, não dá para simular) · afeta dado de negócio real e permissão (não UX pura) · risco principal é de escopo (7 tabelas do domínio, cortado para 6 com 3 sem UI ainda — decisão explícita acima) e de modelagem (RLS + soft-delete consistentes com o resto do schema) · prova por integração real + UI real · rollback trivial (schema novo, sem dado de produção ainda) · multi-tenant preservado (RLS igual a toda outra tabela de negócio, `tenantIsolationPolicy`).

## Próximos milestones (resumo; detalhes em `ROADMAP.md`)
M6 mesas/QR/sessão de mesa → M7 cardápio do cliente + carrinho (fim da Fase B).
