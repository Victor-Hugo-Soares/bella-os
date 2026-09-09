# Bella OS

Sistema operacional de restaurante: cliente pede pelo QR na mesa, produção recebe em tempo real (KDS), administração/caixa controla a operação. Multi-tenant desde a primeira migration. Primeiro tenant: Bella III (Franco da Rocha/SP).

- Regras de trabalho do agente: `CLAUDE.md` e `docs/BELLA_OS_AUTONOMOUS_HANDOFF.md`
- Produto: `docs/PRODUCT_CONTEXT.md` · Arquitetura: `docs/ARCHITECTURE.md` · Domínio: `docs/DOMAIN_MODEL.md`
- Estado e plano: `docs/PROJECT_STATE.md`, `docs/ACTIVE_PLAN.md`, `docs/ROADMAP.md`
- Setup local: `docs/RUNBOOK_DEV.md`

```bash
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:app-role && pnpm db:seed
pnpm dev            # API em http://localhost:3001/health
pnpm check          # lint + format + typecheck + unit
pnpm test:integration
```
