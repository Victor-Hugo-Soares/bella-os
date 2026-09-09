# Bella OS — Runbook de Desenvolvimento

> Como preparar a máquina, rodar, testar e diagnosticar. Se um passo não funcionar como descrito, o runbook está errado: corrija-o.

## 1. Pré-requisitos
- Node 24 (arquivo `.nvmrc`). Verificar: `node --version`.
- pnpm 10 (`npm i -g pnpm@10` ou `corepack enable`). O campo `packageManager` do `package.json` fixa a versão.
- Docker Desktop (para o Postgres local) **ou** uma `DATABASE_URL` de um Postgres 16 acessível.
- Git com identidade do projeto (ver §6) e GitHub CLI autenticado como `Victor-Hugo-Soares`.

## 2. Primeira execução
```bash
pnpm install
cp .env.example .env          # ajuste se o Postgres não for o do compose
pnpm db:up                    # sobe postgres:16 na porta 5433 (cria bella_dev e bella_test)
pnpm db:migrate               # aplica migrations (drizzle) em DATABASE_URL
pnpm dev                      # API em http://localhost:3001 (health em /health, ready em /ready)
```

## 3. Comandos oficiais
| Comando | O que faz |
|---------|-----------|
| `pnpm check` | lint + prettier + typecheck + testes unitários (mesmo conjunto do job `quality` da CI) |
| `pnpm lint` / `pnpm format` / `pnpm format:fix` | ESLint / Prettier (checar / corrigir) |
| `pnpm typecheck` | `tsc --noEmit` em todos os pacotes |
| `pnpm test` | unitários (Vitest) em todos os pacotes |
| `pnpm test:integration` | integração contra Postgres real (`TEST_DATABASE_URL`) |
| `pnpm build` | empacota a API em `apps/api/dist` (tsup) |
| `pnpm --filter @bella/api start` | roda a API compilada |
| `pnpm db:up` / `pnpm db:down` | sobe/derruba o Postgres do compose |
| `pnpm db:generate` | gera migration SQL a partir do schema Drizzle (`packages/db/src/schema`) |
| `pnpm db:migrate` | aplica migrations pendentes |
| `pnpm db:check` | valida consistência das migrations |

Variáveis: ver `.env.example`. `tsx` carrega `.env` da raiz automaticamente em `dev` e `db:migrate`; para `test:integration` exporte `TEST_DATABASE_URL` no shell (ou use um `.env` carregado pelo seu terminal).

## 4. Estrutura
```
apps/api            Fastify — módulos em src/modules/<dominio>/{routes,service,repo,events}.ts
packages/domain     regras puras (dinheiro, estados, permissões) — sem I/O
packages/contracts  schemas zod compartilhados (erros, DTOs, eventos)
packages/db         Drizzle: schema, migrations, seed, withTenant()
packages/config     tsconfig compartilhado
docs/               memória do projeto (leia CLAUDE.md primeiro)
```

## 5. Diagnóstico rápido
- **`/ready` devolve `degraded`/`not_configured`:** `DATABASE_URL` não definida (esperado no M0). `database: error` = banco fora ou credencial errada; teste `docker compose ps` e `psql`/`pg_isready`.
- **Erro com `request_id`:** procure no log da API pelo mesmo `request_id` (pino JSON; em dev sai formatado pelo pino-pretty).
- **Windows + Git Bash:** evite `node -e` com barras invertidas (o MSYS reescreve `\`); prefira scripts em arquivo ou a ferramenta de edição.
- **Headings em serif no web (M4+):** gotcha do Tailwind v4 documentado em `FRONTEND_GUIDELINES.md`.

## 6. Git e GitHub
Identidade **local** do repositório (já configurada; confira com `git config user.email`):
```
Victor Hugo <116037876+Victor-Hugo-Soares@users.noreply.github.com>
```
A máquina tem várias contas no GitHub CLI. Antes de qualquer push: `gh auth status` deve mostrar `Victor-Hugo-Soares` como ativa; se não, `gh auth switch --user Victor-Hugo-Soares`. Remote: `https://github.com/Victor-Hugo-Soares/bella-os.git`. Branches de trabalho `claude/<tema>`; `main` só recebe merge com CI verde.

## 7. Docker Desktop falhando ao iniciar (ENV-1 em `KNOWN_ISSUES.md`)
Sintoma em 2026-09-09: "starting services: initializing Inference manager … remove …/Docker/run/dockerInference: Não é possível o acesso ao arquivo". Passos:
1. Fechar o Docker Desktop completamente (ícone da bandeja → Quit; conferir no Gerenciador de Tarefas que não há `Docker Desktop`/`com.docker.backend`).
2. Apagar a pasta `C:\Users\Loma\AppData\Local\Docker\run` (contém sockets antigos que o Docker não consegue remover sozinho). Pode exigir Explorer ou PowerShell como administrador.
3. Em `%APPDATA%\Docker\settings-store.json` já foi gravado `"EnableInference": false` (backup em `settings-store.json.bak-bella-os`).
4. Abrir o Docker Desktop de novo e testar `docker version`.
5. Se persistir: reinstalar o Docker Desktop (mantém imagens/volumes por padrão).

**Fallback sem Docker:** instalar PostgreSQL 16 localmente (instalador oficial) e apontar `DATABASE_URL`/`TEST_DATABASE_URL` para ele (criar bancos `bella_dev` e `bella_test`), **ou** criar um Postgres de desenvolvimento no Railway e usar a URL dele. Os testes de integração funcionam com qualquer Postgres 16 vazio.

## 8. OneDrive (ENV-5)
O workspace está em uma pasta sincronizada. Se `pnpm install` ou `git` apresentarem arquivos travados/corrompidos, exclua a pasta `bella-os` da sincronização (Configurações do OneDrive → Sincronização e backup → Gerenciar backup / Escolher pastas) ou mova o projeto para `C:\dev\bella-os` e reabra.
