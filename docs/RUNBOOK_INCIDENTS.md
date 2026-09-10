# Bella OS — Runbook de Incidentes

> Passo a passo para quando algo dá errado em produção. Diferente de `RUNBOOK_DEV.md` (que é sobre preparar a máquina de desenvolvimento): este documento é para o momento em que o restaurante está operando e algo parou de funcionar. Se um passo daqui não bater com a realidade, o runbook está errado — corrija-o assim que descobrir.

## 1. Antes de qualquer coisa: onde olhar

- **API fora do ar / lenta**: verificar o painel do Railway (deploy ativo, logs, uso de CPU/memória).
- **Erro específico de um cliente**: pedir o `request_id` (aparece no header `x-request-id` de toda resposta e no envelope de erro) e procurar no log da API por esse mesmo id (pino JSON) — nunca tentar adivinhar pela hora aproximada.
- **Dúvida se é o banco**: `GET /ready` da API devolve `database: "ok" | "error"` — é o primeiro diagnóstico, sempre antes de mexer em qualquer coisa.

## 2. API fora do ar

1. Confirmar no Railway se o deploy está rodando (não travado num build, não crashando em loop).
2. Ver os últimos logs — se for um erro determinístico (não intermitente), geralmente é uma migration pendente ou uma variável de ambiente faltando.
3. Se o último deploy foi o causador: reverter para o commit anterior em `main` (`git revert`, nunca `git reset --hard` num branch compartilhado) e fazer novo deploy — nunca "consertar em produção" editando código direto no servidor.
4. Depois de resolvido: registrar o que aconteceu em `docs/KNOWN_ISSUES.md` (se for um risco recorrente) ou num ADR (se mudou uma decisão de arquitetura).

## 3. Postgres inacessível

1. Confirmar no painel do Railway se o serviço de Postgres está ativo (não é raro ser só uma reinicialização de manutenção do provedor).
2. `GET /ready` continua sendo o primeiro sinal — `database: "error"` com a API no ar confirma que o problema é só o banco, não o deploy.
3. Enquanto o banco não volta: a API fica fora do ar de propósito (`ARCHITECTURE.md` — cloud-first, sem mutação offline no KDS/caixa, R-1 em `KNOWN_ISSUES.md`). Não há nada para "contornar" — é esperar o banco voltar.
4. Se o Postgres não voltar sozinho e não houver backup automático do Railway disponível: seguir a seção 4 (restaurar de um backup manual).

## 4. Restaurar de um backup (M18, ACTIVE_PLAN.md)

**Antes de tudo**: se o Railway tiver backup automático/point-in-time-recovery habilitado no plano contratado, essa é a PRIMEIRA linha de defesa — geralmente mais recente e mais simples que um dump manual. Os passos abaixo são o fallback portátil, e são exatamente o que a CI já prova que funciona (`.github/workflows/ci.yml`, job `backup/restore testado`) — nunca inventar um comando diferente do que já foi testado.

### 4.1 Tirar um backup (fazer isso ANTES de qualquer tentativa de conserto, sempre)

```bash
DATABASE_URL="postgres://..." pnpm db:backup
```

Grava em `packages/db/backups/bella-<timestamp>.dump` (nunca commitado — `.gitignore`). Guardar esse arquivo fora do repositório (ex.: um bucket, ou baixar para a própria máquina) antes de prosseguir — é a rede de segurança caso o próximo passo dê errado.

### 4.2 Restaurar

```bash
DATABASE_URL="postgres://..." pnpm db:restore packages/db/backups/bella-<timestamp>.dump
```

`pg_restore --clean --if-exists` — limpa os objetos existentes antes de recriar. É seguro rodar em cima de um banco que já tem dados (vira uma substituição completa pelo conteúdo do dump), mas por isso mesmo: **nunca restaurar num banco de produção sem ter certeza de qual dump é o certo** — confirmar a data/hora do arquivo com quem pediu a restauração antes de rodar.

### 4.3 Confirmar que deu certo

Nunca assumir que "rodou sem erro" significa "os dados estão certos" (mesma regra anti-falso-positivo do `CLAUDE.md`). Checar pelo menos:

```sql
select count(*) from tenants;
select count(*) from orders;
select count(*) from ledger_entries;
```

Comparar com o que se esperava (se possível, com números registrados antes do incidente) — é exatamente o que o job de CI faz automaticamente contra um banco de teste.

## 5. Divergência de caixa não registrada / dado financeiro suspeito

- **Nunca editar `ledger_entries` diretamente** — é append-only por desenho (`DOMAIN_MODEL.md §1.6`); qualquer correção manual quebra a auditoria e o gate G7.
- Se um valor parece errado: usar `GET /v1/reports/daily` (M16) e `GET /v1/tabs/:id/bill` para reconstruir o que o sistema calculou, e comparar com o que a comanda física/maquininha mostrou — o objetivo é entender a causa, não "consertar o número".
- Divergência de caixa real (contado ≠ esperado) já é tratada pelo próprio fluxo de fechamento (M14) — aparece em `cash_divergences`, nunca é ajustada em silêncio.

## 6. Contatos e limites

Hoje o Bella OS tem um único operador (o Victor) e nenhuma equipe de plantão formal. Este runbook assume que quem está resolvendo o incidente tem acesso ao Railway, ao GitHub e às credenciais do banco — se não tiver, o primeiro passo é conseguir esse acesso antes de qualquer outra coisa.
