# Bella OS — Runbook de Deploy (Railway)

> Decisão de hosting: `docs/ARCHITECTURE.md §9` (Railway — dois serviços, `api` e `web`,
> mais Postgres gerenciado). **Status: já em produção real desde 2026-09-10.** O Victor
> criou o projeto no Railway e me deu acesso total via `railway login` local — a partir
> daí toda a configuração (banco, variáveis, deploy) foi feita por mim via CLI/API.

## 1. Estado real do projeto Railway

- **Projeto**: `bella-os` (id `f7f07fd1-08b0-4191-852e-667fb9d196cd`), workspace da
  conta `arniabrasil@gmail.com`. Ambiente único: `production`
  (id `2d65a576-8526-4187-8c96-b6174f6a5bc6`).
- **Serviço `api`** (id `f6299683-e4d9-4144-89d7-43a041304591`): GitHub
  `arnia-brasil/bella-os` branch `main`, domínio
  `https://api-production-f7d1.up.railway.app`. Build/start configurados via
  mutação GraphQL `serviceInstanceUpdate` direto na API do Railway (ver nota no §3 —
  o dot-path `railway environment edit --service-config` **não persiste** build/deploy
  nesta CLI, é um bug real, não um erro de uso).
- **Serviço `web`** (id `ba2f92f4-9984-44c7-a311-984d6e58482d`): mesmo repo, domínio
  `https://web-production-751e3.up.railway.app`.
- **Serviço `Postgres`** (id `e5bf7bae-3b19-43ca-8dd3-640bda6360dd`): template
  `ghcr.io/railwayapp-templates/postgres-ssl:18`, volume `postgres-volume` (5 GB).
- Não existe mais `apps/api/railway.json`/`apps/web/railway.json` no repo — Config as
  Code (esses arquivos) foi abandonado em favor de configuração direta no Railway,
  porque o CLI local tinha um bug ao gravar `build`/`deploy` por essa via (ver §3).

## 2. Variáveis já configuradas

**`api`**: `NODE_ENV=production`, `APP_DATABASE_URL` (papel restrito `bella_app`, não
o dono do banco — ver `apps/api/src/config.ts`), `BETTER_AUTH_SECRET` (gerado,
guardado só no Railway, não está em nenhum arquivo do repo), `BETTER_AUTH_URL`,
`WEB_ORIGIN` (apontando pro domínio do `web`).

**`web`**: `NEXT_PUBLIC_API_URL` (apontando pro domínio do `api`).

**Banco**: migrations já aplicadas (`pnpm db:migrate`) e papel `bella_app` já criado
(`pnpm db:app-role`) contra o Postgres de produção — feito localmente através de um
proxy TCP temporário (`railway tcp-proxy create`/`delete`, nunca deixado exposto por
mais tempo que o necessário). **`pnpm db:seed` NÃO foi rodado** — produção está vazia
de propósito, esperando dados reais do Bella III (ver §4).

## 3. Achados reais durante a configuração (guardar para não repetir a investigação)

- Os dois serviços que o Victor criou originalmente pelo dashboard (`@bella/api`/
  `@bella/web`) nunca chegaram a existir de verdade — ficavam "staged" (a tela mostrava
  "Apply N changes" nunca aplicado, e a API confirmava zero `ServiceInstance` na
  environment). Foram apagados (`serviceDelete` via GraphQL) e recriados do zero com
  `railway add --service <nome>` (nomes simples, sem `@`/`/` no nome — caracteres
  especiais pareciam confundir alguns comandos do CLI que resolvem serviço por nome).
- `railway environment edit --service-config <svc> build.buildCommand`/
  `deploy.startCommand`/`build.builder`/`deploy.healthcheckPath` **roda sem erro mas
  não persiste** (confirmado repetidas vezes via `railway environment config --json`
  depois). Isolado: não é conflito com `railway.json` (o bug persistiu depois de
  apagar os arquivos); `railway variable set` funciona normalmente, só os campos de
  `build`/`deploy` que falham silenciosamente. **Workaround**: chamar a mutação
  GraphQL `serviceInstanceUpdate(serviceId, environmentId, input)` diretamente em
  `https://backboard.railway.com/graphql/v2` (token em `~/.railway/config.json` →
  `user.accessToken`, não `user.token`, que dá "Not Authorized").
- A Infrastructure as Code nova (`.railway/railway.ts`, `railway config plan`/`apply`)
  também não funcionou nesta máquina — `railway config plan` falhava com "requires
  Railway CLI 5.42.1 or newer" mesmo com a CLI já atualizada pra 5.52.1. Abandonada em
  favor do GraphQL direto; não há `.railway/` no repo.

## 4. Próximo passo real: dados do Bella III

O seed atual (`packages/db/src/seed/index.ts`) só cria tenants **fictícios**. Falta:
- Cardápio real (categorias, produtos, preços).
- Mesas/áreas reais do salão.
- Conta(s) de staff reais (nome, email, papel).

Sem isso, o Railway está no ar mas o banco de produção está vazio — ninguém consegue
de fato usar o sistema ainda. Assim que o Victor passar esses dados, a próxima sessão
deve inserir o tenant real (editando o seed ou via SQL direto contra o Postgres de
produção, mesmo processo de proxy TCP temporário usado para as migrations).

## 5. Verificação pós-deploy (já feita, repetir sempre que houver dúvida)

1. `curl https://api-production-f7d1.up.railway.app/health` → `{"status":"ok",...}`.
2. `curl https://api-production-f7d1.up.railway.app/ready` → `"checks":{"database":"ok"}`
   (prova que `APP_DATABASE_URL`/`bella_app` estão certos e o banco responde).
3. Login real de staff em `https://web-production-751e3.up.railway.app/admin/login`
   — só vai funcionar depois que existir uma conta de staff real no banco (§4).
4. CORS: confirmar no DevTools do navegador que chamadas do `web` para o `api` não são
   bloqueadas (prova que `WEB_ORIGIN` bate com a URL real do `web`).

## 6. O que ainda depende do Victor

- **Domínio customizado** (opcional, tem custo de registro) — os subdomínios
  `*.up.railway.app` já servem HTTPS válido, funcionam sem custo adicional.
- **Dados reais do Bella III** (§4) — só ele tem essa informação.
- **Confirmar se o plano gratuito do Railway é suficiente** ou se algum upgrade de
  plano será necessário conforme o uso cresce — decisão de custo, não técnica.
