# Bella OS — Problemas Conhecidos, Riscos, Incógnitas e Dependências

> Atualizar sempre que um risco surgir, mudar de severidade ou for resolvido. Resolvidos vão para `memory/archive/` com data.

## Bloqueios ativos
Nenhum. O projeto pode continuar com Sonnet a partir de `ACTIVE_PLAN.md`.

## Ambiente (máquina do Victor, 2026-09-09)

| ID | Item | Severidade | Estado | Ação |
|----|------|-----------|--------|------|
| ENV-1 | **Docker Desktop falha ao iniciar** ("Inference manager" não consegue remover socket em `AppData/Local/Docker/run/dockerInference`, erro Windows 1920 "arquivo inacessível ao sistema" — nem `fsutil` consegue consultar o arquivo). Tentativas: encerrar processos, apagar sockets (bloqueado pelo sistema/pelo classificador), `EnableInference=false` em `settings-store.json` (backup `.bak-bella-os`), reiniciar: daemon continuou sem responder. Diagnóstico: handle órfão de driver de kernel, provavelmente só libera com reboot da máquina. | alta para dev local | **aberto** — ação do Victor | Reiniciar o Windows (mais provável de resolver) **ou** apagar `C:\Users\Loma\AppData\Local\Docker\run` pelo Explorer como Administrador **ou** reinstalar o Docker Desktop (`RUNBOOK_DEV.md §7`). Enquanto isso, a **CI é a frente de integração** — provado no M1: 19/19 testes de integração (incluindo isolamento RLS) verdes contra Postgres real em service container |
| ENV-2 | Conta ativa do GitHub CLI era `victorlins-dev`; identidade Git global também. | média | tratado | Identidade local do repo = Victor-Hugo-Soares; `gh auth switch` feito. Cada sessão valida (gate G0). Trocar a conta ativa afeta outros projetos do Victor na máquina |
| ENV-3 | Repositório `bella-os` criado **público** pelo Victor. | média | aguardando decisão | Recomendação: tornar privado (produto comercial). Nenhum segredo será commitado independentemente |
| ENV-4 | `pnpm` não existia; instalado globalmente (10.x). CI usa `corepack`/`packageManager`. | baixa | resolvido | — |
| ENV-5 | Workspace fica dentro do **OneDrive**. Sincronização pode travar `node_modules` e `.git`. | média | aberto | Recomendação: excluir a pasta `bella-os` da sincronização do OneDrive ou mover para `C:\dev\bella-os` (o `launch.json` do Victor já usa `C:\dev` em outro projeto). Não movido nesta sessão para não quebrar o caminho que o Victor abriu |

## Incógnitas de produto (defaults em `PRODUCT_CONTEXT.md §2`)
Q1 comanda por mesa/pessoa · Q2 taxa de serviço · Q3 couvert · Q4 quem abre a mesa · Q5 fiscal · Q6 meio de pagamento · Q7 impressão · Q8 meio a meio · Q9 horário/dia operacional · Q10 cardápio real · Q11 mesas/áreas · Q12 equipe/dispositivos · Q13 internet/contingência · Q14 repositório público.
Estado: todas com default configurável. Perguntar ao Victor **em lote** quando a Fase D se aproximar (Q1, Q2, Q3, Q6) e na Fase F (Q10–Q13). Q5 antes de qualquer promessa fiscal. Q14 agora (não bloqueante).

## Riscos técnicos

| ID | Risco | Prob. | Impacto | Mitigação |
|----|-------|-------|---------|-----------|
| R-1 | Internet do restaurante cai → KDS e caixa param (cloud-first, ADR-011) | média | alto | failover 4G recomendado; cliente usa 4G próprio; sem mutação offline; exportação de comandas abertas; agente de impressão na Fase E |
| R-2 | Better Auth: API/versão pode ter mudado em relação ao conhecimento do modelo | média | médio | Sonnet confere docs oficiais + tipos instalados antes de M2; adapter isolado; plano B Lucia/Oslo |
| R-3 | ~~RLS mal configurada dá falsa sensação de segurança~~ — **mitigado no M1**: `tenant-isolation.test.ts` prova via SQL direto que `bella_app` (não owner, sem BYPASSRLS) nunca vê linha de outro tenant, insert com `tenant_id` divergente é rejeitado pela policy, e sem contexto nenhuma linha aparece. Continua válido revalidar a cada tabela de negócio nova (usar `tenantIsolationPolicy()` + `.enableRLS()`, ADR-021) | — | — | resolvido; regressão coberta por CI |
| R-4 | Idempotência incompleta (chave só no front) | baixa | alto | chave persistida no carrinho; teste de duplo envio e retry no CI; UNIQUE no banco |
| R-5 | Estimativa de espera vira promessa e gera reclamação | alta | médio | sempre faixa + rótulo; sem ETA até haver tempos base cadastrados |
| R-6 | SSE atrás de proxies/CDN com buffering | baixa | alto | Railway suporta streaming; header `X-Accel-Buffering: no`; polling de segurança no KDS |
| R-7 | Relógio do dispositivo KDS errado exibe tempos absurdos | média | baixo | tempo decorrido calculado a partir de `server_time` enviado no heartbeat |
| R-8 | Migração destrutiva em produção | baixa | alto | expand/migrate/contract; backup antes; gate G10 |
| R-9 | Crescimento do `CLAUDE.md` e perda de memória entre sessões | média | médio | protocolo de compactação; arquivo de estado separado |
| R-10 | Tailwind v4 + `@theme inline` fazendo headings caírem em serif | alta | baixo | gotcha documentado em `FRONTEND_GUIDELINES.md`; teste `document.fonts.check` no E2E |
| R-11 | OneDrive corrompendo `.git`/`node_modules` | média | alto | ENV-5 |
| R-12 | Cancelamento após produção sem política de estoque/CMV definida | média | médio | `charge_on_cancel` + motivo desde M11; estoque na Fase E consome esse registro |
| R-13 | `ALTER ROLE ... PASSWORD $1` não é aceito pelo parser de DDL do Postgres (posição sintática exige literal, não bind parameter) | — | — | **resolvido no M1** via `pg.escapeLiteral` + teste de regressão (`set-app-role-password.test.ts`); lição registrada em ADR-022 para qualquer DDL dinâmico futuro |
| R-14 | `DrizzleQueryError` envolve a mensagem real do Postgres em `.cause`; `.message` de topo é só "Failed query: ..." | baixa | baixo | ao testar/mapear erros de banco, sempre inspecionar `.cause`, não `.message` (helper `expectPgErrorMatching` em `apps/api/test/integration/_pg-error.ts`); relevante para o mapeamento de erros da API em módulos futuros (M8+) |

## Dívidas conscientes assumidas no bootstrap
- `apps/web` ainda não existe (criado em M4 pelo Sonnet com `create-next-app` pinado na versão vigente).
- Nenhuma migration ainda (M1).
- CI ainda sem job de E2E e sem gitleaks até existir web (M4).
- Docker local não validado nesta máquina (ENV-1).

## Dependências externas
GitHub (repo), Railway (deploy futuro; conta do Victor), Google Fonts + Fontshare (fontes), Docker Desktop (dev local), futuro: bucket S3-compatível, PSP (PIX), impressoras ESC/POS.
