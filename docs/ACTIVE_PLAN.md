# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.6/§4 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M16 (relatório do dia operacional) está mergeado em `main` (commit `5342e84`, PR #25, CI verde na segunda rodada — 1 regressão de teste pega pela própria CI). Victor confirmou a ordem da Fase E: relatório do dia → **backup/restore** → resiliência de conexão.

## Milestone atual: **M18 — Backup/restore testado + runbook de incidentes** (Fase E)

### Problema
Hoje não existe nenhuma forma testada de recuperar o banco de um desastre — nem script de backup/restore no repositório, nem prova de que um dump realmente volta a funcionar, nem runbook para quando algo der errado. Railway (hosting alvo, `ARCHITECTURE.md`) tem backup automático nos planos pagos, mas isso não é testado por nós nem serve como fallback local/portável.

### Resultado esperado
1. **`packages/db/scripts/backup.sh`** e **`restore.sh`**: `pg_dump --format=custom` / `pg_restore --clean --if-exists`, usando `DATABASE_URL`. `pnpm db:backup` / `pnpm db:restore <arquivo>`.
2. **Prova real na CI** (não só "os comandos rodaram sem erro"): job novo que semeia dados, faz backup, cria um banco novo vazio, restaura o dump nele, e compara contagens de linhas entre o banco original e o restaurado — se não bater, o job falha.
3. **`docs/RUNBOOK_INCIDENTS.md`** (novo, separado do `RUNBOOK_DEV.md` que é de setup): passo a passo para API fora do ar, Postgres inacessível, restaurar de um backup, e confirmar que a restauração deu certo.

### Riscos
- **Comando de dump ou restore "funciona" mas silenciosamente perde dados** (ex.: `--data-only` sem estrutura, ou schema incompatível) — por isso a prova por contagem de linhas na CI é obrigatória, não é feature opcional.
- **Versão do `pg_dump`/`pg_restore` do runner da CI divergindo da versão 16 do Postgres do serviço** — pode gerar avisos ou incompatibilidade sutil. Instalar explicitamente `postgresql-client-16` no job em vez de confiar no que já vem no runner.
- **Backup local nunca é o único plano** — o runbook deve deixar claro que o backup automático do Railway (se habilitado) é a primeira linha de defesa em produção; o script daqui é o fallback portátil e o que prova que um dump volta a funcionar de verdade.

### Testes (2 frentes — normal: não é mutação de dinheiro em produção, é infraestrutura)
1. CI: dump → banco novo → restore → contagem de linhas bate entre original e restaurado (tenants, orders, ledger_entries, pelo menos).
2. Inspeção: `docs/RUNBOOK_INCIDENTS.md` revisado contra o próprio script (os comandos do runbook têm que ser exatamente os que a CI já provou que funcionam).

### Gate de Plano (respondido no início da execução do M18)
1. **Formato `custom` do `pg_dump`** (`-Fc`), não SQL plano — permite `pg_restore --clean --if-exists` (restauração limpa em cima de um banco já existente, útil para o próprio teste de CI) e é mais compacto. `--no-owner --no-privileges` para o dump não depender de quem é dono das tabelas no banco de origem (relevante porque a app roda como `bella_app`, não como dono, ADR-020).
2. **Prova de verdade na CI, não só "rodou sem erro"**: o job novo cria um SEGUNDO banco (`bella_test_restore`) no mesmo serviço Postgres, restaura o dump nele, e compara `count(*)` de `tenants`, `orders`, `order_items` e `ledger_entries` entre origem e destino — só passa se os números baterem exatamente.
3. **`postgresql-client-16` instalado explicitamente no job** (`apt-get install`) — nunca confiar no que o runner já tem por padrão, evita mismatch de versão do `pg_dump` cliente vs. servidor.
4. **Scripts em bash simples** (`packages/db/scripts/backup.sh`/`restore.sh`), não TypeScript — são wrappers finos sobre `pg_dump`/`pg_restore`, chamar um binário externo de dentro de um script Node só adicionaria uma camada sem necessidade.
5. **`docs/RUNBOOK_INCIDENTS.md` novo**, separado do `RUNBOOK_DEV.md` (que é sobre configurar a máquina de desenvolvimento, não sobre reagir a um incidente em produção) — evita misturar dois públicos/momentos diferentes no mesmo documento.
6. **Backups locais nunca commitados** — `packages/db/backups/` no `.gitignore` (dump de dados reais no Git seria um vazamento de dados de cliente, regra 9 do CLAUDE.md em espírito, mesmo não sendo um `.env`/token literal).

---

## Histórico — M16 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`GET /v1/reports/daily?from=&to=` (`reports.view`): faturamento, ticket médio, mais vendidos, cancelamentos/descontos por operador — sem tabela nova, só consulta. Faturamento replica a regra de `items_total` do `computeBill` (M12). Sem cálculo automático de "dia operacional" (decisão consciente, timezone sem biblioteca testada). Fecha `KNOWN_ISSUES.md` R-16.

---

## Histórico — M15 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`tab_closures` (fotografia final, `tab_id` único, migration `0012`); `POST /v1/tabs/:id/close` (permissão nova `tabs.close`) só fecha com saldo 0, idempotente por construção; `GET /v1/tabs/:id/split?parts=N` divide o saldo restante (`splitEvenly` do M0), puramente informativo. Golden Journey: um teste único prova o ciclo inteiro cliente→cozinha (KDS real)→salão→caixa→fechamento, ledger somando exatamente 0 ao final.

## Histórico — M14 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`cash_movements` (sangria/suprimento, `cash.movement`) e `cash_divergences` (schema novo, migration `0011`); `POST /v1/cash-sessions/:id/close` (`cash.close`) calcula `expected` por forma de pagamento sempre derivado de `payments`+`cash_movements` (nunca armazenado à parte), grava divergência só quando `counted ≠ expected` (nunca ajusta em silêncio), idempotente por reconstrução. Corrigidas 3 divergências reais entre `DOMAIN_MODEL.md` e o que já estava implementado desde o M13.

## Histórico — M13 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`cash_registers`/`cash_sessions`/`payments` (migration `0010`); abrir sessão de caixa (`cash.open`, uma por registrador via índice único); registrar pagamento (`payments.record`, nunca excede o saldo — `OVERPAYMENT` — reaproveitando `computeBill` do M12 dentro da MESMA transação para serializar concorrência real); estornar pagamento (`payments.void`, idempotente).
