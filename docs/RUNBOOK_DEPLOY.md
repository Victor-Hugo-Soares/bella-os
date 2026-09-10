# Bella OS — Runbook de Deploy (Railway)

> Decisão de hosting: `docs/ARCHITECTURE.md §9` (Railway — dois serviços, `api` e `web`,
> mais Postgres gerenciado). Este runbook cobre o que **eu (Claude) já deixei pronto no
> repositório** e o que **só o Victor pode fazer** (criar conta, conectar cartão,
> comprar domínio) — nada disso é algo que uma sessão autônoma deveria fazer sozinha:
> envolve credenciais, pagamento e decisões que são do dono do produto.

## 1. O que já está pronto no repositório (não precisa fazer nada aqui)

- `apps/api/railway.json` e `apps/web/railway.json` — config de build/start de cada
  serviço (Nixpacks, `pnpm --filter` a partir da raiz do monorepo).
- `apps/api/src/config.ts` — a API **recusa subir** com `NODE_ENV=production` sem
  `APP_DATABASE_URL`, `BETTER_AUTH_SECRET` e `WEB_ORIGIN` definidas (erro explícito na
  inicialização, não um comportamento silencioso inseguro).
- Rate limiting (`@fastify/rate-limit`, 300 req/min por IP) e cabeçalhos de segurança
  (`@fastify/helmet`) já registrados em `apps/api/src/app.ts`.
- `packages/db/scripts/backup.sh` / `restore.sh` — testados no CI (job
  `backup-restore`), prontos para rodar manualmente contra o Postgres de produção
  quando ele existir (ver `docs/RUNBOOK_INCIDENTS.md`).
- `GET /health` (liveness) e `GET /ready` (checa conexão com o banco) já existem —
  usados pelo `healthcheckPath` dos `railway.json` acima.

## 2. O que só o Victor pode fazer (conta, cartão, domínio)

Railway tem um plano gratuito de avaliação (crédito inicial, sem cobrança automática
enquanto não configurar um cartão), então dá pra criar o projeto e testar sem gastar —
mas a conta em si, e qualquer decisão de plano pago depois, é sua.

1. **Criar conta em [railway.app](https://railway.app)** (login com GitHub é o mais
   simples — usa a mesma conta `Victor-Hugo-Soares`).
2. **Novo projeto → "Deploy from GitHub repo"** → selecionar `Victor-Hugo-Soares/bella-os`.
3. **Adicionar um serviço Postgres** ao projeto (Railway → "New" → "Database" →
   "PostgreSQL"). Railway gera a `DATABASE_URL` automaticamente como variável do
   serviço de banco — vamos usá-la manualmente nos passos abaixo (nenhuma automação
   aqui, é só copiar/colar as credenciais certas nos serviços certos).
4. **Criar o serviço `api`**:
   - "New" → "GitHub Repo" → mesmo repo → em "Settings", **Root Directory** continua
     `/` (raiz do monorepo — precisa do lockfile do workspace inteiro), mas em
     **"Config-as-code" → "Config File Path"** apontar para `apps/api/railway.json`.
   - Variáveis de ambiente do serviço (Settings → Variables):
     - `NODE_ENV=production`
     - `APP_DATABASE_URL` — **não** é a `DATABASE_URL` que o Railway gera para o
       Postgres (aquela é o *dono* do banco, ignora RLS — ver comentário em
       `apps/api/src/config.ts`). Rodar `pnpm db:app-role` uma vez, manualmente, contra
       o Postgres de produção (com `DATABASE_URL` e `APP_DB_PASSWORD` apontando pra
       lá) para criar o papel restrito `bella_app`, e só então montar a connection
       string com esse usuário/senha.
     - `APP_DB_PASSWORD` — a senha escolhida para o papel `bella_app` (gere uma forte,
       ex. `openssl rand -base64 24`).
     - `BETTER_AUTH_SECRET` — gerar com `openssl rand -base64 32`. Guardar em local
       seguro (gerenciador de senhas) além do Railway — perder esse valor invalida
       todas as sessões ativas.
     - `BETTER_AUTH_URL` — a URL pública que o Railway atribuir a este serviço (ex.
       `https://bella-api-production.up.railway.app`), ou o domínio customizado do
       passo 6.
     - `WEB_ORIGIN` — a URL pública do serviço `web` (passo 5).
   - `PORT`/`HOST` não precisam ser definidas — o Railway injeta `PORT` automaticamente
     e `apps/api/src/config.ts` já usa `HOST=0.0.0.0` por padrão.
5. **Criar o serviço `web`**: mesmo processo, apontando o "Config File Path" para
   `apps/web/railway.json`. Variável necessária: `NEXT_PUBLIC_API_URL` = a URL pública
   do serviço `api` (passo 4).
6. **Domínio customizado (opcional, tem custo de registro)**: Railway → serviço → 
   "Settings" → "Networking" → "Custom Domain". Enquanto não tiver um domínio próprio,
   os subdomínios `*.up.railway.app` gerados automaticamente já servem HTTPS válido —
   dá pra operar o Bella III com eles sem gastar nada a mais.

## 3. Depois do primeiro deploy — dados reais do Bella III

O seed atual (`packages/db/src/seed/index.ts`) só cria tenants **fictícios**
(`dono@bella.example.com`). Antes de operar de verdade, alguém (Victor ou uma sessão
futura desta IA, com os dados em mãos) precisa:
- Rodar as migrations contra o Postgres de produção (`pnpm db:migrate` com
  `DATABASE_URL` apontando pra lá).
- Criar o tenant real do Bella III com cardápio, mesas/áreas e conta de staff reais —
  hoje isso só é possível editando o seed ou inserindo direto via SQL; não existe UI
  de onboarding de tenant ainda (`docs/KNOWN_ISSUES.md` Q10-Q12).

## 4. Verificação pós-deploy (mesma disciplina do resto do projeto — nunca só "abriu")

1. `curl https://<url-do-serviço-api>/health` → `{"status":"ok",...}`.
2. `curl https://<url-do-serviço-api>/ready` → `"status":"ok"` e
   `"checks":{"database":"ok"}` (prova que `APP_DATABASE_URL` está certa e o banco
   responde).
3. Login real de staff em `https://<url-do-serviço-web>/admin/login` com uma conta
   criada no banco de produção.
4. Testar CORS de verdade: abrir o DevTools do navegador na URL do `web`, confirmar
   que as chamadas para a `api` não são bloqueadas (prova que `WEB_ORIGIN` bate com a
   URL real do `web`).
