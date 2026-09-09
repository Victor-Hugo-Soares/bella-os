# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `docs/FRONTEND_GUIDELINES.md` → `DOMAIN_MODEL.md` §2 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M3 (dispositivos, PIN) está mergeado em `main` (commit `a751062`, PR #3, CI verde: 45/45 testes de integração). Este plano do M4 assume isso como ponto de partida.

## Milestone atual: **M4 — Web shell, login e design system** (Fase A, primeira tela real)

### Problema
Toda a Fase A até aqui é só API. Não existe nenhuma tela. O M4 é o primeiro milestone de frontend: criar `apps/web`, provar que o design system do Victor (`FRONTEND_GUIDELINES.md`) funciona de verdade, e ter uma tela de login funcional consumindo o M2. Não é para construir cardápio/KDS/admin ainda (isso é Fase B em diante) — é a fundação de UI.

### Pesquisa já feita nesta sessão (não repetir — confirmar de novo só se a instalação divergir)
Versões atuais confirmadas via npm em 2026-09-09: `next@16.3.4`, `react@19.3.0`, `react-dom@19.3.0`, `tailwindcss@4.3.3`. O CLI de componentes hoje se chama **`shadcn`** (pacote `shadcn@4.21.0`), não mais `shadcn-ui` — usar `npx shadcn@latest init`/`add`, conferindo a versão instalada antes.

### Resultado esperado
1. `apps/web` criado com Next.js 16 (App Router), TypeScript, Tailwind v4, integrado ao monorepo pnpm (workspace).
2. Tokens de design aplicados de verdade: fontes (Schibsted Grotesk, Switzer, JetBrains Mono), paleta oklch dark/light, conforme `FRONTEND_GUIDELINES.md` — com o teste real (`document.fonts.check`) provando que carregaram, não só "parece certo visualmente".
3. Três grupos de rota preparados (mesmo que só o de login tenha conteúdo real ainda): `/(customer)`, `/(kds)`, `/(admin)`.
4. Tela de login (`/admin/login` ou equivalente) que chama a API real do M2 (`/api/auth/sign-in/email`), trata erro/loading/sucesso, e redireciona para uma página protegida simples que mostra `/v1/me`.
5. CORS da API (`WEB_ORIGIN`, já preparado desde o M2) configurado e testado de verdade entre os dois processos (não só same-origin via proxy).
6. `apps/web` builda e roda (`next build`, smoke real — mesma disciplina do M0/M3: rodar o build, não só confiar no dev server).

### Arquivos envolvidos
- `apps/web/` novo (estrutura do Next.js App Router).
- `apps/web/src/app/globals.css` ou equivalente: tokens de `FRONTEND_GUIDELINES.md` como CSS custom properties + `@theme inline` do Tailwind v4 — **atenção ao gotcha já documentado**: `var(--font-display)` em `@layer base` sob `@theme inline` resolve vazio; usar stack literal ou classes utilitárias.
- `apps/web/src/lib/api-client.ts`: cliente HTTP mínimo para a API (`fetch` com `credentials: 'include'`, base URL configurável).
- `apps/web/src/app/(admin)/login/page.tsx`, `.../page.tsx` protegida pós-login.
- `apps/api/.env`/config: `WEB_ORIGIN` apontando para a URL real do dev server do Next.
- `.claude/launch.json` ou equivalente (se existir convenção no repo) para rodar `apps/web` em dev.
- Testes: Playwright ainda não configurado no monorepo — **decidir e registrar** se entra neste milestone ou fica para quando houver mais telas (risco de escopo). Recomendação: instalar Playwright agora (mínimo: um teste E2E do fluxo de login), já que é a única forma real de provar CORS + cookie de sessão funcionando entre dois processos — inspeção visual sozinha não prova isso.

### Riscos
- Tailwind v4 + Next.js 16: confirmar a integração atual (o setup de `@tailwindcss/postcss` ou plugin pode ter mudado) rodando `create-next-app` de verdade e inspecionando o que ele gera, em vez de assumir a configuração do Tailwind v3.
- CORS + cookies entre `localhost:3000` (web) e `localhost:3001` (api): exige `credentials: 'include'` no fetch **e** `Access-Control-Allow-Credentials` + origem exata (não `*`) no servidor — já preparado no M2 (`cors` com `credentials: true`, `origin: config.WEB_ORIGIN`), mas nunca testado de ponta a ponta com dois processos reais.
- Gotcha de fontes do Tailwind v4 (`FRONTEND_GUIDELINES.md`) é uma armadilha conhecida — testar com `document.fonts.check` desde o primeiro commit, não no final.

### Testes (mínimo 2 frentes — mudança normal, não crítica)
1. Build real (`next build`) + execução do servidor de produção compilado (não só `next dev`).
2. E2E (Playwright, se instalado neste milestone) ou, no mínimo, teste manual documentado com evidência (screenshot) do fluxo de login completo entre os dois processos reais.
3. Inspeção visual em pelo menos duas larguras (mobile e desktop), já que `FRONTEND_GUIDELINES.md` exige isso desde a primeira tela.

### Critérios de aceite
- [ ] `apps/web` builda e roda de verdade (smoke do build de produção, não só dev).
- [ ] Fontes carregam (`document.fonts.check` positivo para as 3 famílias).
- [ ] Login funciona de ponta a ponta entre os dois processos reais (cookie de sessão via CORS).
- [ ] `pnpm check` continua verde para o monorepo inteiro; CI atualizada para incluir `apps/web` (lint/typecheck/build).
- [ ] Docs atualizados; `ACTIVE_PLAN.md` reescrito para o início da Fase B (catálogo).

### Gate de Plano (respondido em 2026-09-09)
Problema entendido (nenhuma tela existe; login é a menor fatia vertical que prova a pilha toda) · solução menor não existiria (é preciso o front para provar CORS/cookie de verdade) · afeta UX e a primeira impressão do produto (padrão de estética é regra global do Victor, não opcional) · risco principal é técnico (Tailwind v4 + Next 16 + fontes), não de produto · prova por build real + E2E ou evidência manual · rollback trivial (`apps/web` é novo, sem dado) · multi-tenant preservado (nenhuma rota de negócio ainda, só login).

## Próximos milestones (resumo; detalhes em `ROADMAP.md`)
Fase B: M5 catálogo → M6 mesas/QR → M7 cardápio do cliente + carrinho.
