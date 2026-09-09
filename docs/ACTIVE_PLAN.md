# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.2 → `DECISIONS.md` ADR-005/ADR-019/ADR-020 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

## Milestone atual: **M2 — Auth staff, papéis, permissões** (Fase A)

### Problema
`users`, `roles`, `role_permissions` e `memberships` já existem e estão semeados (M1), mas ninguém consegue de fato logar: não há sessão, não há cookie, não há checagem de permissão na API. Sem isso, toda superfície administrativa fica bloqueada.

### Resultado esperado
1. Staff loga com email+senha e recebe uma sessão (cookie httpOnly); logout funciona; sessão expira/renova de forma razoável.
2. `GET /v1/me` devolve o usuário, o(s) tenant(s) com membership, o papel e as permissões efetivas (a partir de `role_permissions`, fonte única `@bella/domain/permissions.ts`).
3. Middleware `requirePermission(key)` na API: 401 sem sessão, 403 com sessão mas sem a permissão, 200 com a permissão — testado nos dois sentidos (positivo e negativo) para pelo menos duas permissões diferentes.
4. Login em um tenant não dá acesso a dados de outro tenant (reusa o isolamento do M1 — a sessão carrega `tenantId` do membership ativo, e toda query de negócio continua passando por `withTenant`).
5. Nenhuma senha, hash ou token aparece em log (o redactor do M0 já cobre `*.password`, `*.pin`, `*.token` — confirmar que cobre os campos reais que o Better Auth usa).

### Pesquisa já feita nesta sessão (não repetir — usar diretamente)
Versão instalada/compatível confirmada via npm e documentação oficial em 2026-09-09:
- `better-auth@1.7.3` — peer `drizzle-orm: ^0.45.2 || >=1.0.0-rc.1 <2.0.0` **bate exatamente** com o `drizzle-orm@0.45.2` já usado no projeto. Nenhum bump de versão necessário.
- Adapter: pacote separado `@better-auth/drizzle-adapter` (não é mais um submódulo de `better-auth`, é pacote próprio — confirmar versão exata no momento de instalar, mesma disciplina do M1).
  ```ts
  import { betterAuth } from 'better-auth';
  import { drizzleAdapter } from '@better-auth/drizzle-adapter';
  export const auth = betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema: { ...schema, user: schema.users } }),
  });
  ```
  O mapeamento `user: schema.users` é necessário porque nossa tabela já se chama `users` (plural, ADR/consistência do projeto) e não `user` (nome default do Better Auth).
- Schema: Better Auth tem CLI própria (`npx @better-auth/cli generate` ou equivalente — **confirmar o nome exato do pacote da CLI no momento de rodar**, `auth@latest generate` apareceu na doc mas pode ter mudado) que gera as tabelas que ele espera (`session`, `account`, `verification` — DOMAIN_MODEL.md já reserva esses nomes). Gerar o SQL, **revisar antes de aplicar** (mesma disciplina do M1: nenhuma tabela nova sem entender o que ela faz), e então rodar via `drizzle-kit generate` + nosso `migrate.ts` — não usar o migrator próprio do Better Auth, para manter um único pipeline de migration.
- Fastify: **não há plugin oficial** — integração é uma rota catch-all manual:
  ```ts
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const headers = fromNodeHeaders(request.headers); // @better-auth/node ou helper próprio — confirmar import exato
      const req = new Request(url, { method: request.method, headers, body: ... });
      const res = await auth.handler(req);
      reply.status(res.status);
      res.headers.forEach((v, k) => reply.header(k, v));
      return reply.send(await res.text());
    },
  });
  ```
  Sessão em rota protegida: `await auth.api.getSession({ headers: fromNodeHeaders(request.headers) })` → `null` se não autenticado.
- **Antes de escrever código de verdade**: reconfirmar esses detalhes (nome exato do pacote da CLI, do helper `fromNodeHeaders`, assinatura atual de `betterAuth()`) na documentação oficial e nos tipos instalados — a pesquisa acima é um ponto de partida de baixo risco, não uma cola definitiva; bibliotecas mudam entre a pesquisa e a implementação.

### Arquivos envolvidos
- `apps/api/src/modules/identity/` novo: `auth.ts` (instância do Better Auth), `routes.ts` (rota catch-all + `/v1/me`), `require-permission.ts` (middleware), `service.ts` (resolver permissões efetivas de um membership).
- `packages/db/src/schema/auth.ts` novo: tabelas geradas pela CLI do Better Auth (`session`, `account`, `verification`), revisadas e ajustadas ao estilo do projeto (nomes de coluna, RLS — **essas tabelas são globais como `users`, sem `tenant_id`**, então sem RLS por tenant, mas revisar se o Better Auth expõe algo que precise ficar por trás de um controle de acesso).
- Migration nova gerada por `pnpm db:generate` a partir do schema atualizado.
- `apps/api/src/config.ts`: novas variáveis (`BETTER_AUTH_SECRET`, `WEB_ORIGIN` para `trustedOrigins`/CORS).
- `.env.example`: documentar as novas variáveis (sem valor real).
- Testes: `apps/api/test/integration/auth.test.ts` (login válido/inválido, sessão, `/v1/me`), `apps/api/test/integration/require-permission.test.ts` (positivo/negativo em 2+ permissões, dois tenants).

### Arquitetura / regras
- `AppError` (`UNAUTHENTICATED`, `PERMISSION_DENIED`) já existem em `@bella/contracts` desde o M0 — reusar, não inventar novo formato de erro.
- Ator resolvido pelo middleware: `{ type: 'user', userId, tenantId, membershipId, roleId, permissions: PermissionKey[] }` — mesma forma que `ARCHITECTURE.md §5` já descreve; guests e devices (M3) vão seguir o mesmo formato de ator.
- CORS: até agora `origin: false` (M0); M2 precisa liberar para `WEB_ORIGIN` (ainda sem `apps/web`, mas configurável desde já) porque cookies de sessão exigem CORS correto quando o front existir.
- `SameSite=Lax`, `httpOnly`, `secure` em produção — conferir o que o Better Auth faz por padrão e se precisa de override.

### Riscos
- Biblioteca de terceiros pode ter mudado desde a pesquisa acima (mitigado: pesquisa foi feita nesta mesma sessão, mas reconfirmar tipos instalados antes de codar de verdade).
- Se o adapter do Better Auth não suportar bem o mapeamento de nome de tabela `users`→`user`, pode ser mais simples renomear nossa tabela para `user` (singular) e absorver o custo agora, em vez de forçar um mapeamento frágil — decisão a registrar como ADR se acontecer.
- Sessão de staff não pode vazar entre tenants: um usuário pode ter memberships em vários tenants (ex.: dono de duas unidades no futuro) — a sessão HTTP não fixa um tenant sozinha; o tenant ativo deve ser explícito em cada request (header ou rota) e validado contra as memberships do usuário. Definir isso no plano de UI mais adiante (Fase B), mas a API já precisa aceitar/validar um `tenant_id` de contexto por request desde o M2.

### Testes (mínimo 3 frentes — crítico: autenticação/permissão)
1. Integração: login válido, login inválido (senha errada, usuário inexistente), sessão persiste entre requests, logout invalida.
2. Integração: `requirePermission` positivo e negativo para papéis diferentes (ex.: `cashier` pode `payments.record`, não pode `users.manage`).
3. Integração: usuário com membership só no tenant Demo não consegue agir no tenant Bella mesmo autenticado.
4. Inspeção: nenhuma senha/hash aparece em log (grep nos logs capturados do teste).

### Critérios de aceite
- [ ] Login/logout funcionais via API, cobertos por teste.
- [ ] `requirePermission` com teste positivo e negativo.
- [ ] Isolamento de tenant validado também no nível de sessão HTTP (não só no banco).
- [ ] `pnpm check` verde; CI verde no PR; nenhuma senha em log.
- [ ] Docs atualizados (`DOMAIN_MODEL.md` se o schema do Better Auth divergir do reservado; `QA_LEDGER.md`; `PROJECT_STATE.md`; `ACTIVE_PLAN.md` reescrito para M3).

### Rollback
Tabelas novas (session/account/verification), sem dado real. `drop table` em dev se necessário.

### Gate de Plano (respondido em 2026-09-09)
Problema entendido pelo comportamento esperado (ninguém consegue logar) · solução menor não existe (auth é auth) · afeta identidade e segurança diretamente · falhas plausíveis: API do Better Auth mudou desde a pesquisa, mapeamento de tabela `users` frágil, sessão vazando entre tenants · prova por integração positiva+negativa · rollback trivial (sem dado real) · multi-tenant preservado (sessão carrega tenant explícito, não implícito).

## Próximos milestones (resumo; detalhes em `ROADMAP.md`)
M3 dispositivos/PIN/observabilidade → M4 web shell + login + design system → Fase B (catálogo, mesas, QR).
