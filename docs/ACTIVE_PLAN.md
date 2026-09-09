# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.2 (`devices`, `pairing_codes`) → `ARCHITECTURE.md` §5 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

## Antes de começar: confirme que o M2 está mergeado

Este plano assume que a branch `claude/m2-auth-staff` (PR de login de staff) já está mergeada em `main` com CI verde. Se não estiver: rode `gh pr view` / `gh run list` no repositório, resolva qualquer pendência do M2 primeiro (o M3 depende do módulo de identidade existir e funcionar), e só depois continue.

## Milestone atual: **M3 — Dispositivos, PIN e observabilidade mínima** (Fase A)

### Problema
Hoje só existe login de staff com email+senha (M2). Mas KDS e caixa são dispositivos **compartilhados** — ninguém vai digitar email/senha no meio do rush. Falta: (1) um jeito de um dispositivo (tablet da cozinha, PC do caixa) se autenticar como "este dispositivo, desta estação/registradora", (2) um PIN curto para atribuir a ação a uma pessoa sem exigir login completo, (3) observabilidade suficiente para diagnosticar problemas em produção sem depender só de "printar e olhar".

### Resultado esperado
1. Um gerente (autenticado, com `devices.manage`) gera um código de pareamento de 6 dígitos com TTL curto para um tipo de dispositivo (`kds`, `cashier`, `floor`, `admin`).
2. O próprio dispositivo (sem login de staff) troca esse código por um token de longa duração, escopado (estação(ões) para KDS, registradora para caixa).
3. Requisições de dispositivo se autenticam pelo token (header próprio, ex.: `X-Device-Token`), resolvido para um ator `{ type: 'device', deviceId, tenantId, kind, stationIds/cashRegisterId }` — mesma forma de ator do M2, mas outro tipo.
4. Ações sensíveis feitas a partir de um dispositivo (desconto, cancelamento após produção, fechar caixa) exigem **PIN de operador** validado no momento (não é sessão — é confirmação pontual), com bloqueio por tentativas (`pin_failed_attempts`, `pin_locked_until` já existem em `memberships` desde o M1).
5. Observabilidade: `/ready` reporta latência do banco; logs continuam sem vazar segredo (conferir que device token e PIN entram no redactor); um jeito simples de listar dispositivos ativos/revogar um.

### Arquivos envolvidos
- `packages/db/src/schema/devices.ts` novo: `devices`, `pairing_codes` (DOMAIN_MODEL.md §1.2) — **com RLS por tenant** (diferente de `users`/`sessions`: dispositivo pertence a um tenant).
- `apps/api/src/modules/identity/devices/` novo: `routes.ts` (gerar código, trocar por token, revogar, listar), `service.ts`, `require-device.ts` (equivalente a `requirePermission` para ator de dispositivo).
- `apps/api/src/modules/identity/pin.ts`: validar PIN (argon2id — **confirmar biblioteca atual antes de escrever código**, mesma disciplina do M2: não assumir de memória), bloqueio por tentativas.
- `apps/api/src/config.ts`: nenhuma variável nova óbvia; revisar se o redactor do logger cobre o novo header de token de dispositivo.
- Testes: `apps/api/test/integration/devices.test.ts` (pareamento, troca de código, expiração de TTL, revogação, isolamento entre tenants), `apps/api/test/integration/pin.test.ts` (PIN certo, PIN errado, bloqueio após N tentativas, desbloqueio por tempo).

### Riscos
- Escolha de biblioteca de hash de PIN/token: **pesquisar antes de implementar** (regra 12) — não assumir `argon2` sem checar se está mantido/instalável neste ambiente (build nativo pode ser um problema em CI/Windows; considerar `@node-rs/argon2` ou `bcrypt` como alternativas, decidir com evidência).
- Token de dispositivo de longa duração é, na prática, um bearer token — se vazar, um atacante age como aquele dispositivo. Mitigar com escopo mínimo (só a(s) estação(ões)/registradora dele) e revogação fácil.
- PIN é curto (4–6 dígitos) — por design, de baixa entropia; a segurança vem do bloqueio por tentativas + de ser sempre um segundo fator sobre um dispositivo já autenticado, nunca sozinho.

### Testes (mínimo 3 frentes — crítico: autenticação de dispositivo + PIN)
1. Integração: pareamento completo (gerar código → trocar por token → usar token) e código expirado/já usado é rejeitado.
2. Integração: PIN certo passa, PIN errado nega, N+1 tentativas bloqueia, bloqueio expira.
3. Integração: dispositivo de um tenant não autentica nem gera dado em outro tenant (reusa padrão `ownerDb`/`appDb` do M1/M2).
4. Inspeção: nenhum token/PIN em log.

### Critérios de aceite
- [ ] Pareamento de dispositivo funcional e testado (positivo + negativo + expiração).
- [ ] PIN funcional e testado (positivo + negativo + bloqueio).
- [ ] Isolamento entre tenants provado também para dispositivos.
- [ ] `/ready` com latência do banco.
- [ ] `pnpm check` verde; CI verde; nenhum segredo em log.
- [ ] Docs atualizados; `ACTIVE_PLAN.md` reescrito para M4.

### Gate de Plano (respondido em 2026-09-09)
Problema entendido pelo comportamento esperado (equipe não loga com email/senha no rush) · afeta autenticação e segurança diretamente · falhas plausíveis: token de dispositivo vazado, PIN de baixa entropia sem bloqueio, biblioteca de hash escolhida sem verificar disponibilidade no ambiente · prova por integração positiva+negativa+expiração · rollback trivial (tabelas novas, sem dado real) · multi-tenant preservado (RLS em `devices`/`pairing_codes` desde o início).

## Próximos milestones (resumo; detalhes em `ROADMAP.md`)
M4 web shell + login + design system (primeira tela real) → Fase B (catálogo, mesas, QR).
