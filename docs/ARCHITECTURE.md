# Bella OS — Arquitetura

> Arquitetura proposta no bootstrap (2026-09-09) e justificativas. Decisões individuais estão em `DECISIONS.md` (ADRs). Modelo de dados e máquinas de estado estão em `DOMAIN_MODEL.md`. Se o código divergir deste documento, investigue e atualize a fonte errada.

## 1. Forma geral

**Monólito modular em TypeScript, num monorepo pnpm**, com dois processos implantáveis e pacotes compartilhados:

```
bella-os/
├── apps/
│   ├── api/          # Fastify (Node 24). REST + SSE. Único lugar com regra de negócio e acesso ao banco.
│   └── web/          # Next.js (App Router). Três superfícies: cliente (/m), KDS (/kds), admin/caixa (/admin).
├── packages/
│   ├── db/           # Drizzle ORM: schema, migrations SQL, seed, helpers de transação com contexto de tenant.
│   ├── domain/       # Regras puras (dinheiro, máquinas de estado, cálculo de totais, permissões). Sem I/O.
│   ├── contracts/    # Schemas zod compartilhados API<->web (DTOs, eventos SSE, erros).
│   └── config/       # tsconfig/eslint/prettier compartilhados.
├── tools/            # scripts (QR PDF, backup, agente de impressão no futuro).
├── docs/
└── .github/workflows/ci.yml
```

**Por que não Next.js "full-stack" com API routes?** Precisamos de um processo persistente para SSE (KDS em tempo real), filas leves (impressão, recálculo de estimativa) e testes de domínio sem o runtime do Next. Separar `api` mantém o domínio testável com `fastify.inject()` e reutilizável pelo futuro agente de impressão e app do garçom.

**Por que não microserviços / Supabase-heavy / serverless?** Custo operacional e cognitivo. Regras financeiras em policies SQL e edge functions são difíceis de testar e revisar; serverless dificulta SSE e jobs. Um monólito com **domínios separados por pasta e por contrato** dá o mesmo isolamento lógico sem rede entre eles.

## 2. Domínios (bounded contexts) dentro de `apps/api/src/modules/`

| Módulo | Responsabilidade | Depende de |
|--------|------------------|------------|
| `identity` | usuários staff, sessões, PIN, dispositivos, papéis, permissões | tenants |
| `tenants` | tenant, configurações tipadas, superadmin | — |
| `catalog` | categorias, produtos, variações, grupos de modificadores, estações, disponibilidade, fotos | tenants |
| `tables` | áreas, mesas, QR, sessões de mesa, comandas, chamados de garçom | tenants, identity |
| `ordering` | criação idempotente de pedido, itens, snapshot de preço, cancelamento, roteamento para tickets | catalog, tables, ledger (via eventos) |
| `kitchen` | tickets de produção, status, bump/recall, esgotar item, estimativa | ordering, catalog |
| `ledger` | lançamentos financeiros append-only por comanda, taxas, couvert, descontos, totais | tables |
| `payments` | pagamentos manuais multi-forma, estorno, fechamento de comanda | ledger, cash |
| `cash` | caixas físicos, sessões de caixa, sangria/suprimento, fechamento com divergência | ledger |
| `inventory` (Fase E) | insumos, ficha técnica, movimentos, CMV | catalog |
| `reporting` | consultas agregadas por dia operacional (somente leitura) | todos |
| `audit` | log de auditoria, outbox de eventos de domínio, idempotency keys | — |
| `printing` (Fase E) | fila de impressão, impressoras, agente | kitchen |
| `realtime` | SSE por tenant/canal, replay por `last_event_id` | audit (outbox) |

Regras entre módulos: um módulo só fala com outro pela **camada de serviço** (função exportada) ou por **evento de domínio**; nunca acessa tabela alheia diretamente. Cada módulo tem `routes.ts` (HTTP), `service.ts` (casos de uso, transações), `repo.ts` (SQL via Drizzle), `events.ts`. `packages/domain` contém apenas funções puras usadas pelos serviços (cálculo de total, validação de transição, arredondamento).

## 3. Stack e justificativas

| Camada | Escolha | Por quê (custo, simplicidade, segurança, evolução) | Alternativas descartadas |
|--------|---------|-----------------------------------------------------|--------------------------|
| Linguagem | TypeScript estrito ponta a ponta | um só idioma para Sonnet; tipos compartilhados via `contracts` | — |
| Runtime | Node 24 LTS (instalado) | disponível na máquina, Railway suporta, ecossistema | Bun (menos previsível em libs Postgres) |
| Gerenciador | pnpm 10 (workspaces) | monorepo eficiente, lockfile determinístico | npm workspaces (mais lento), yarn |
| API | Fastify 5 | maduro, rápido, validação por schema, plugins de cookie/rate-limit, SSE via `reply.raw`, `inject()` para testes | Hono (bom, mas menos plugins de servidor longo), NestJS (excesso de cerimônia), Express (legado) |
| Validação | zod (em `contracts`) | um schema serve para API, web e testes | class-validator |
| ORM/migrations | Drizzle ORM + drizzle-kit (migrations SQL versionadas) | SQL explícito, transações com `SET LOCAL` para RLS, constraints e índices parciais sem "mágica" | Prisma (transação/RLS desajeitadas, engine pesada) |
| Banco | PostgreSQL 16 | transações, constraints, índices parciais, RLS, `LISTEN/NOTIFY`, JSONB para snapshots | MySQL, SQLite (sem RLS/concorrência adequada), Firestore (sem transação relacional forte) |
| Frontend | Next.js (App Router) + React + Tailwind v4 + shadcn/ui customizado | padrão do Victor (`FRONTEND_GUIDELINES.md`), SSR do cardápio para primeira pintura rápida em 4G | Vite SPA (perde SSR do cardápio), três apps separados (triplica deploy) |
| Estado no front | TanStack Query + SSE para invalidação; Zustand só para carrinho local | servidor é a verdade; carrinho é o único estado legitimamente local | Redux |
| Auth staff | **Better Auth** (email+senha, sessões em Postgres via Drizzle) + camada própria de **dispositivo + PIN** | evita auth artesanal (risco), integra com Drizzle, permite plugins depois; PIN é regra de negócio nossa | Supabase Auth (acopla ao Supabase), Auth.js (foco em OAuth), auth 100% própria (footgun) |
| Auth cliente | token de sessão de mesa assinado (HMAC) em cookie httpOnly, sem conta | zero atrito, LGPD mínima | login social (atrito) |
| Realtime | **SSE** (`text/event-stream`) do `api`, canais por tenant (`station:{id}`, `table-session:{id}`, `admin`), eventos persistidos em `domain_events` com `seq` para replay | reconexão nativa do browser com `Last-Event-ID`, passa por proxies, unidirecional basta (mutações são HTTP) | WebSocket/Socket.IO (bidirecional desnecessário, mais estado), Supabase Realtime (acopla), polling puro (latência) |
| Fan-out multi-instância | fase 1: instância única. Fase 2: `LISTEN/NOTIFY` do Postgres para acordar SSE de outras instâncias | zero infra extra até precisar | Redis pub/sub (custo/infra a mais agora) |
| Filas/jobs | tabela `jobs` no Postgres com `FOR UPDATE SKIP LOCKED` + worker no próprio processo `api` | uma dependência a menos; volume do restaurante é pequeno | BullMQ/Redis (quando houver mais tenants) |
| Cache | nenhum cache distribuído. HTTP cache para imagens; TanStack Query no cliente | evitar bug de cache por tenant | Redis |
| Storage/imagens | bucket S3-compatível (Railway Buckets ou Cloudflare R2), chaves prefixadas por tenant, `sharp` para gerar tamanhos | barato, CDN | disco local (não sobrevive a deploy) |
| Deploy | **Railway**: serviço `api`, serviço `web`, Postgres gerenciado; ambientes `staging` e `production` | Victor já usa; processo persistente para SSE; ~US$ 5–20/mês inicial | Vercel (serverless ruim para SSE), VPS manual (mais manutenção) |
| CI | GitHub Actions: lint, typecheck, unit, integration (Postgres em service container), build; E2E Playwright em job separado | gate automático antes de `main` | — |
| Logs | pino JSON com `request_id`, `tenant_id`, `actor`, `order_id` etc.; Railway logs; Sentry opcional na Fase E | correlação exigida pelo gate G9 | — |
| Testes | Vitest (unit + integração contra Postgres real), Playwright (E2E mobile/desktop), `fastify.inject()` | ver `TESTING_STRATEGY.md` | Jest |
| Impressão (Fase E) | agente local Node ("Bella Print Agent") no PC do restaurante que consome `print_jobs` via SSE/polling e fala ESC/POS com impressoras de rede/USB | servidor na nuvem não alcança LAN | impressão via browser (não confiável) |

## 4. Multi-tenancy

- **Um banco, um schema, `tenant_id` em toda tabela de negócio** (UUID, NOT NULL, FK para `tenants`).
- **Tenant = uma unidade de restaurante.** Empresa com várias unidades = vários tenants ligados a uma `organization` opcional (relatório consolidado no futuro). Evita duplicar escopo (`tenant_id` + `location_id`) em toda tabela.
- **Duas camadas de isolamento:**
  1. **Aplicação:** todo request resolve `TenantContext` (do subdomínio/slug, da sessão staff ou do token de mesa). Repositórios recebem o contexto e **sempre** filtram por `tenant_id`. Nenhuma query de negócio sem tenant.
  2. **Banco (defesa em profundidade):** RLS em tabelas de negócio com policy `tenant_id = current_setting('app.tenant_id')::uuid`. A API abre transação e executa `SET LOCAL app.tenant_id = $1`. O usuário de banco da aplicação **não** é superuser nem owner (RLS não pode ser ignorado). Migrations e superadmin usam papel separado.
- **Teste obrigatório de vazamento:** dois tenants no seed; suíte de integração tenta ler/escrever cruzado por API e por repositório; deve falhar sempre.
- **Superadmin** é papel de plataforma (`platform_admins`), não uma flag em `memberships`.
- Cache, storage, jobs, eventos e logs carregam `tenant_id` explícito.

## 5. Identidade e acesso

**Atores:** cliente anônimo (sessão de mesa), staff (usuário com membership no tenant), dispositivo (KDS/caixa registrado), superadmin.

- **Staff:** Better Auth com email+senha; sessão em cookie httpOnly `SameSite=Lax`; `memberships(user_id, tenant_id, role_id)`. Um usuário pode pertencer a vários tenants.
- **Papéis e permissões:** conjunto fixo de **chaves de permissão** no código (`orders.create`, `orders.cancel.after_production`, `payments.record`, `discounts.apply`, `cash.close`, `catalog.manage`, `users.manage`, ...). Papéis são por tenant, com seed padrão (dono, gerente, caixa, garçom, cozinha). Checagem sempre no servidor via `requirePermission()`; UI apenas esconde.
- **Dispositivos compartilhados:** tablet da cozinha e PC do caixa fazem **login de dispositivo** (gerente pareia com código de 6 dígitos; gera token de dispositivo de longa duração com escopo restrito: `kds:{station}` ou `cashier:{register}`). Ações que exigem responsabilidade individual (desconto, cancelamento, fechar caixa) pedem **PIN de operador** (4–6 dígitos, hash argon2, bloqueio após tentativas) e registram o operador na auditoria. Isto reflete a realidade: ninguém digita email e senha no meio do rush.
- **Cliente:** QR fixo aponta para `/{tenant-slug}/m/{table-code}`. Servidor valida tenant+mesa, cria/associa sessão de mesa e devolve cookie `table_session` (token assinado, escopo = uma sessão). Trocar o código na URL só leva a outra mesa **se** a sessão dessa mesa permitir entrada (regra anti-abuso configurável: confirmação do salão no primeiro pedido, limite de valor por sessão não confirmada, rate limit por IP/dispositivo). Cliente nunca vê dados de outra sessão. Ao fechar a comanda o token morre.
- **Rate limiting** em endpoints públicos (`@fastify/rate-limit`) por IP + sessão.

## 6. Dinheiro

- **Inteiros em centavos** (`bigint` no Postgres, `number` com validação de inteiro no TS, nunca `float`). Helper único em `packages/domain/money.ts` para soma, proporção (divisão de conta), arredondamento **half-even** e distribuição de centavos residuais.
- **Preço nunca vem do cliente.** O pedido recebe apenas `product_id`, `variant/modifier ids`, `quantity`, `notes`; servidor resolve preço no catálogo vigente e grava **snapshot** (nome, preço unitário, modificadores com preço) no item.
- **Ledger append-only por comanda** (`ledger_entries`): cobrança de item, estorno de item, taxa de serviço, couvert, desconto, pagamento, estorno de pagamento, ajuste. Saldo = soma. Total da comanda é **reconstruível** a partir do ledger + itens; um teste de reconciliação compara os dois caminhos.
- **Fechamento de caixa** calcula o esperado por forma de pagamento a partir dos pagamentos e movimentos da sessão de caixa; operador informa o contado; diferença vira `cash_divergences` com motivo.
- Desconto e cancelamento exigem permissão, motivo e autor; cancelamento após início de produção pode ser "com cobrança" (cliente paga) ou "cortesia/perda" — regra em `DOMAIN_MODEL.md`.

## 7. Idempotência, concorrência e consistência

- **Chave de idempotência** obrigatória em `POST /orders`, `POST /payments`, `POST /table-sessions`, transições de status: header `Idempotency-Key` (UUID gerado no cliente e persistido junto ao carrinho). Tabela `idempotency_keys(tenant_id, scope, key, request_hash, response_status, response_body, created_at)` com UNIQUE `(tenant_id, scope, key)`; repetição devolve a resposta original; mesma chave com corpo diferente devolve `409`.
- **Transações** para tudo que toca mais de uma tabela (pedido + itens + tickets + ledger + evento).
- **Bloqueio pessimista curto** (`SELECT ... FOR UPDATE`) na comanda ao registrar pagamento, fechar comanda, transferir itens; na sessão de caixa ao fechar.
- **Transições otimistas** de status: `UPDATE ... WHERE id = $1 AND status = $expected`; zero linhas afetadas = conflito `409` com estado atual devolvido para a UI se corrigir.
- **Constraints que tornam estados impossíveis impossíveis:** índice parcial único "uma sessão aberta por mesa"; "um caixa aberto por registradora"; `CHECK (amount_cents > 0)`; FK com `ON DELETE RESTRICT` em tudo financeiro (nunca cascade em dinheiro); comanda fechada não aceita item (trigger ou checagem em transação com lock).
- **Outbox:** todo evento de domínio é gravado na mesma transação em `domain_events(seq bigserial, tenant_id, channel, type, payload, created_at)`; o publicador SSE lê a partir daí. Reconexão com `Last-Event-ID` reenvia o que faltou. Consumidores (KDS) são idempotentes por `event.id`.
- **Relógio:** servidor grava `timestamptz` em UTC; UI converte para `America/Sao_Paulo`; dia operacional configurável por tenant (`business_day_cutoff`, padrão 05:00).

Cenários analisados (cliente envia enquanto caixa transfere mesa; dois operadores fecham a mesma comanda; duplo toque; retry após timeout; dois KDS bumpam o mesmo ticket; dois caixas registram último item de estoque) e o mecanismo que resolve cada um estão em `DOMAIN_MODEL.md §5`.

## 8. Tempo real e estimativa

- Canais SSE por tenant: `station:{station_id}` (KDS), `table-session:{id}` (cliente), `floor` (salão/expedição/chamados), `admin` (painel). Autorização no handshake: token de dispositivo/sessão define quais canais pode assinar.
- Heartbeat a cada 15 s; cliente considera "offline" após 30 s sem heartbeat e mostra banner; ao reconectar, faz `GET` de estado completo **e** replay de eventos — o estado completo vence.
- **Polling de segurança** (a cada 20 s) no KDS mesmo com SSE, porque um pedido invisível na cozinha é o pior bug possível.
- Estimativa: por estação, `estimated_ready_at = now + base_prep_time(produto) + carga_atual(tickets abertos na estação) × fator`; exibida como faixa (±30%) e recalculada por evento. Primeira versão usa tempos base cadastrados; calibragem por histórico é pós-MVP.

## 9. Degradação, contingência e impressão

Verdade desconfortável: com servidor na nuvem, **se a internet do restaurante cair, KDS e caixa param**. Decisão consciente para o MVP (custo e simplicidade), com mitigações:
1. Recomendar ao Bella roteador com failover 4G (barato) — registrado em `KNOWN_ISSUES.md`.
2. Cliente usa o próprio 4G; pedidos continuam chegando ao servidor e ficam na fila.
3. KDS/caixa mostram claramente "sem conexão" e **não aceitam mutações offline** (evita duplicidade e conflito); ao voltar, reidratam do servidor.
4. Admin pode imprimir/exportar "comandas abertas" a qualquer momento (plano B manual).
5. Fase E: agente local de impressão com fila; opção futura de "modo servidor local" só se a operação exigir.

## 10. Observabilidade e recuperação

- Logs JSON (pino) com `request_id` (header `x-request-id` propagado), `tenant_id`, `actor_type/id`, `device_id`, ids de negócio quando existirem. Sem dados sensíveis (PIN, senha, token).
- `GET /health` (processo) e `GET /ready` (banco). Métricas mínimas: latência por rota, erros 5xx, conexões SSE ativas, tamanho da fila de jobs.
- Erros retornam envelope padronizado `{ error: { code, message, details?, request_id } }` (definido em `contracts`).
- Auditoria (`audit_log`) para toda mutação administrativa e financeira: ator, ação, entidade, antes/depois (JSONB), `request_id`.
- Backups: Railway Postgres com backups + job diário `pg_dump` para bucket com retenção 30 dias; **teste de restore documentado e executado antes da Fase F** (gate G9).
- Migrations sempre "expand → migrate → contract"; nunca dropar coluna com dados no mesmo deploy que para de usá-la.

## 11. Segurança (resumo; detalhes em gates G6 no `QA_LEDGER.md`)

Cookies httpOnly + SameSite; CSRF mitigado por SameSite e verificação de `Origin` em mutações; CORS restrito aos domínios do `web`; helmet/CSP no `web`; rate limit em rotas públicas; argon2id para senha/PIN; segredos só em variáveis de ambiente (`.env` no `.gitignore`, `.env.example` versionado); validação zod em toda entrada; IDs UUID v7 (ordenáveis, não previsíveis o suficiente para não serem autorização — autorização é sempre por sessão + tenant); uploads validados por tipo/tamanho e reprocessados por `sharp`; dependências auditadas em CI (`pnpm audit --prod` como aviso, não bloqueio, no início).

## 12. Ambientes

| Ambiente | Onde | Banco | Uso |
|----------|------|-------|-----|
| local | máquina do dev, `docker compose up db` | Postgres 16 em container | desenvolvimento e testes de integração |
| CI | GitHub Actions | Postgres service container | gates automáticos |
| staging | Railway (ambiente `staging`) | Railway Postgres | validação com dados fictícios, testes em dispositivos reais |
| production | Railway (ambiente `production`) | Railway Postgres + backups | Bella |

Fallback se Docker local não funcionar: banco de desenvolvimento no Railway (ambiente `dev` pessoal) apontado por `DATABASE_URL`. Ver `RUNBOOK_DEV.md`.

## 13. O que esta arquitetura deliberadamente NÃO faz agora

Sem Redis, sem fila externa, sem microserviços, sem GraphQL, sem edge functions, sem WebSocket, sem servidor local no restaurante, sem app nativo, sem Kubernetes. Cada um desses tem um ponto de entrada claro (ver tabela da §3) se o crescimento exigir.
