# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-09 (M4 concluído, aguardando abertura/merge do PR, sessão Sonnet 5)
**Fase:** A — Fundação · **Milestone concluído:** M4 Web shell + login + design system · **Próximo:** M5 Catálogo (início da Fase B, `ACTIVE_PLAN.md`)
**Branch:** `claude/m4-web-shell` (ainda não mergeada) · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Base:** `0ab8e1f` (main)
**CI local:** `pnpm check` e `pnpm build` verdes no monorepo inteiro (7 packages/apps, incluindo `apps/web` pela primeira vez). CI remota (GitHub Actions) a confirmar no PR.

## 1. Estado funcional do produto
Pela primeira vez existe uma tela real: `/admin/login`. Um funcionário abre a URL, digita email/senha, e a chamada vai de verdade para a API (M2) em outro processo/porta — provando CORS e cookie de sessão entre origens diferentes, não só "parece que funciona". Cardápio do cliente e KDS existem só como placeholders de rota (conteúdo real é Fase B/C).

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| identity (login, sessão, permissão, dispositivo, PIN) | **funcional (M1–M3)** | UI de login consumindo agora (M4) |
| `@bella/domain` | dinheiro, IDs, permissões, PIN, token de dispositivo | tudo testado e pesquisado antes de codar |
| `@bella/db` | schema com identidade + auth + devices | catálogo/mesas/pedidos entram em M5+ |
| `apps/web` | **shell criado (M4)**: 3 superfícies por rota, design system aplicado, login funcional | cardápio/KDS/admin reais são Fase B/C |
| catalog / tables | não iniciado | M5–M7 |
| ordering / kitchen | não iniciado | M8–M11 |
| ledger / payments / cash | não iniciado | M12–M15 |

## 3. Ambiente conhecido
Sem mudança de fundo desde o M1 (Docker local com falha, ENV-1; workspace em OneDrive, ENV-5). **ENV-6**: checar `gh auth status` imediatamente antes de cada push continua necessário. Ainda sem Postgres local acessível — bloqueia testar um login **bem-sucedido** de ponta a ponta com dado real (ver §4).

## 4. Evidências do M4 (resumo; detalhes em `QA_LEDGER.md`, decisões em `DECISIONS.md` ADR-028)
- `pnpm check` e `pnpm build` verdes para o monorepo inteiro, incluindo `apps/web` pela primeira vez; CI (`ci.yml`) já cobre isso sem nenhuma mudança de workflow (scripts da raiz são recursivos por design desde o M0).
- Fontes do design system provadas de verdade num browser real (`document.fonts.check`) nas três famílias/duas origens (Google Fonts, Fontshare).
- CORS + cookie de sessão entre dois processos reais (web:3200, api:3001) provados via inspeção de rede real, não só "a tela carregou".
- **Um bug real de UX encontrado e corrigido:** `authFetch()` só reconhecia o formato de erro plano do Better Auth, perdendo a mensagem específica quando a resposta vinha no nosso envelope aninhado (`{ error: { message } }}`) — caso comum quando uma requisição de auth nem chega ao Better Auth. Corrigido para checar as duas formas.
- **Um achado de processo real (não bug de código):** um `next start` já em execução não pega um rebuild em disco — testar contra um servidor "esquecido" rodando fez parecer que uma correção não tinha efeito. Lição registrada em ADR-028 para toda sessão futura de smoke manual.
- **Duas regressões de monorepo reais** encontradas e corrigidas: `pnpm-workspace.yaml` duplicado gerado pelo `create-next-app` (conflitava com o da raiz) e `next typegen` faltando no script `typecheck` de `apps/web` (tipos de rota do App Router não apareciam para um `tsc --noEmit` isolado).
- **Limitação real registrada, não escondida:** sem Postgres local, não foi possível testar um login bem-sucedido → dashboard com dado real. Cobertos: CORS/cookie, fontes, visual em duas larguras, estados de erro/loading, extração de mensagem de erro nos dois formatos possíveis.
- **Playwright adiado** (decisão registrada, não esquecimento): só uma tela real existe e não há dado de teste local para popular um fluxo de sucesso automatizado; reavaliar no M5/M6.

## 5. Decisões que não podem ser esquecidas
**ADR-025** (`devices`/`pairing_codes` sem RLS, de propósito). **ADR-026** (`@node-rs/argon2`; duas regressões de build reais; bug de transação real no PIN). **ADR-027** (consultas de teste via dono precisam filtrar `tenant_id` explicitamente). **ADR-028** (M4: `next typegen` no typecheck; fontes em duas origens; `authFetch` precisa reconhecer dois formatos de erro; `next start` não pega rebuild em disco sozinho — sempre reiniciar depois de rebuildar).

## 6. Perguntas abertas para o Victor
Sem mudança — ver `PRODUCT_CONTEXT.md §2`.

## 7. Dependendo do Victor / pendências operacionais
- Reiniciar a máquina para tentar destravar o Docker Desktop (não bloqueante, mas destravaria testar login bem-sucedido de ponta a ponta localmente).
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).
- Abrir/acompanhar o PR do M4 (`claude/m4-web-shell` → `main`) assim que a CI remota confirmar verde.

## 8. Próximo passo exato
Abrir o PR do M4, acompanhar CI remota, mergear se verde, e então reescrever `ACTIVE_PLAN.md` para o M5 (catálogo, início da Fase B), conforme `docs/ROADMAP.md`.
