# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `DOMAIN_MODEL.md` §1.6/§4 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M18 (backup/restore testado) está mergeado em `main` (commit `1cf638e`, PR #26, CI verde nos 4 jobs de primeira). Último item da ordem que o Victor escolheu para a Fase E: resiliência de conexão.

## Milestone atual: **M20 — Degradação/reconexão endurecida** (Fase E)

### Investigação prévia (evitar redesenhar o que já existe)
Antes de planejar, um agente auditou o que já existe (não só o que `ARCHITECTURE.md` promete):
- **Servidor (`apps/api/src/modules/realtime/`)**: SSE real, autenticado por dispositivo, `Last-Event-ID` com replay via `seq` bigserial do outbox `domain_events` — **já funciona**, mas nunca foi testado o ciclo desconectar→reconectar de verdade (só o caso feliz "conecta e recebe evento"). Um único canal `orders` existe — `station:{id}`/`table-session:{id}`/`admin` são só documentados, nunca implementados.
- **Cliente KDS (`apps/web/.../kds/page.tsx`)**: `EventSource` + polling de segurança de 5s já existem. **Não existe**: banner "sem conexão", detecção de heartbeat silencioso (o servidor manda heartbeat como comentário SSE, que o `EventSource` do browser NUNCA expõe como evento — é invisível para JS, então hoje não dá pra saber que o heartbeat está chegando).
- **`apiFetch`/`authFetch`**: nenhum retry — falha de rede vira erro na tela direto.
- `ARCHITECTURE.md` promete "banner após 30s sem heartbeat" e canais múltiplos que não existem — divergência documentada, corrigida junto.

### Resultado esperado
1. **Heartbeat visível ao cliente**: trocar o comentário SSE (`: heartbeat`) por um evento nomeado (`event: heartbeat`) — só assim o `EventSource` do browser consegue detectar que o servidor está vivo.
2. **Banner "sem conexão" no KDS**: watchdog de 30s (mesmo número já documentado) resetado a cada evento recebido (heartbeat ou de negócio) + reação imediata ao `onerror` do `EventSource`; some sozinho no `onopen`/próximo evento.
3. **Teste real de desconexão→reconexão**: conectar, receber evento A, fechar a conexão de propósito, reconectar com `Last-Event-ID`, gerar evento B, confirmar que só B chega (não replay duplicado de A).
4. **Retry com backoff em `apiFetch` só para `GET`**: falha de rede (não erro HTTP) tenta de novo 2x com backoff curto. Nunca em `POST`/`PATCH` — essas mutações já têm seu próprio mecanismo de segurança (`Idempotency-Key`) e decidir retry automático nelas é uma escolha maior, fora do escopo de "endurecer reconexão".
5. **Correção de `ARCHITECTURE.md`**: descrever o canal único `orders` que existe de verdade; marcar canais por `station`/`table-session`/`admin` como desenho futuro, não implementado.

### Riscos
- **Retry em `GET` pode mascarar um problema real** se usado sem limite — por isso só 2 tentativas com backoff curto (não um loop infinito), e só para falha de rede (exceção do `fetch`), nunca para resposta HTTP de erro (4xx/5xx são respostas legítimas do servidor, não "a rede caiu").
- **Testar reconexão de verdade exige fechar a conexão HTTP de dentro do teste** (não só parar de ler) — usar `AbortController` no cliente de teste, não confiar em timeout.

### Testes (2 frentes — normal: hardening de infraestrutura, não mutação de dinheiro)
1. Integração: ciclo desconectar→reconectar com `Last-Event-ID` real, evento perdido nunca duplicado nem perdido.
2. Visual/browser: banner aparece quando a conexão SSE é interrompida (simulado) e some ao reconectar — testado num navegador real, não só lido no código (`FRONTEND_GUIDELINES.md §7`).

### Gate de Plano (respondido no início da execução do M20)
1. **Heartbeat vira evento nomeado, não comentário SSE** — é a mudança mínima que destrava tudo: sem isso, o cliente literalmente não tem como saber que o servidor está vivo (comentário SSE é invisível ao `EventSource`). `data: {}` vazio, sem payload de negócio.
2. **Watchdog do cliente reseta em QUALQUER evento nomeado recebido** (`heartbeat`, `order.created`, `item.cancelled`), não só heartbeat — qualquer evento prova que a conexão está viva. 30s é o número já documentado em `ARCHITECTURE.md` (heartbeat a cada 15s, margem de 2x).
3. **`onerror` do `EventSource` mostra o banner imediatamente**, sem esperar os 30s do watchdog — o watchdog é o fallback para desconexão "silenciosa" (sem erro TCP explícito), não o caminho principal.
4. **Teste de reconexão usa `AbortController` para fechar a conexão de propósito** (não só parar de consumir o stream) — só assim o servidor detecta o `close` de verdade e o teste prova reconexão real, não só "abri duas conexões separadas".
5. **Retry só em `apiFetch` (rotas `/v1/*`), nunca em `authFetch`** (rotas do Better Auth) — login/logout repetido automaticamente tem semântica própria (ex.: reenviar credenciais) que não é o escopo de "resiliência de rede".
6. **`ARCHITECTURE.md` corrigido para descrever o canal único `orders`** que existe de verdade — canais múltiplos ficam registrados como desenho futuro (nota explícita, não removidos do documento).

---

## Histórico — M18 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`packages/db/scripts/backup.sh`/`restore.sh` (`pg_dump -Fc` / `pg_restore --clean --if-exists`); job novo `backup-restore` na CI prova o ciclo completo (backup → banco novo → restore → contagem de linhas bate); `docs/RUNBOOK_INCIDENTS.md` novo.

## Histórico — M16 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`GET /v1/reports/daily?from=&to=` (`reports.view`): faturamento, ticket médio, mais vendidos, cancelamentos/descontos por operador — sem tabela nova, só consulta. Faturamento replica a regra de `items_total` do `computeBill` (M12). Sem cálculo automático de "dia operacional" (decisão consciente, timezone sem biblioteca testada). Fecha `KNOWN_ISSUES.md` R-16.

---

## Histórico — M15 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`tab_closures` (fotografia final, `tab_id` único, migration `0012`); `POST /v1/tabs/:id/close` (permissão nova `tabs.close`) só fecha com saldo 0, idempotente por construção; `GET /v1/tabs/:id/split?parts=N` divide o saldo restante (`splitEvenly` do M0), puramente informativo. Golden Journey: um teste único prova o ciclo inteiro cliente→cozinha (KDS real)→salão→caixa→fechamento, ledger somando exatamente 0 ao final.

## Histórico — M14 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`cash_movements` (sangria/suprimento, `cash.movement`) e `cash_divergences` (schema novo, migration `0011`); `POST /v1/cash-sessions/:id/close` (`cash.close`) calcula `expected` por forma de pagamento sempre derivado de `payments`+`cash_movements` (nunca armazenado à parte), grava divergência só quando `counted ≠ expected` (nunca ajusta em silêncio), idempotente por reconstrução. Corrigidas 3 divergências reais entre `DOMAIN_MODEL.md` e o que já estava implementado desde o M13.

## Histórico — M13 (resumo; detalhes completos em `QA_LEDGER.md` e `PROJECT_STATE.md §4`)
`cash_registers`/`cash_sessions`/`payments` (migration `0010`); abrir sessão de caixa (`cash.open`, uma por registrador via índice único); registrar pagamento (`payments.record`, nunca excede o saldo — `OVERPAYMENT` — reaproveitando `computeBill` do M12 dentro da MESMA transação para serializar concorrência real); estornar pagamento (`payments.void`, idempotente).
