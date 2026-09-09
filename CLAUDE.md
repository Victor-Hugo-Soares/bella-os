# CLAUDE.md — Bella OS

> Este arquivo é a memória operacional quente do projeto. Leia no início de cada sessão e atualize antes de compactar contexto, trocar de fase ou encerrar um bloco substancial.

## Missão

Construir e operar o Bella OS: sistema completo de restaurante para o Bella III (Franco da Rocha/SP), já arquitetado para evoluir para múltiplos restaurantes. Áreas principais: Cliente mobile via QR, Cozinha/KDS e Administração/Caixa.

## GitHub

- Conta proprietária esperada: `Victor-Hugo-Soares`
- Repositório preferencial, se ainda não existir: `bella-os`
- Antes do primeiro push de uma sessão nova/ambiente novo, validar remote + autenticação + identidade.

## Regras absolutas

1. Planejar antes de implementar qualquer bloco relevante.
2. Passar Gate de Plano antes de alterar código.
3. Nenhuma feature é considerada pronta com uma única evidência.
4. Mudança normal: mínimo 2 frentes independentes de validação.
5. Dinheiro, comanda, autenticação, permissão, cancelamento, fiscal, pagamento e estoque: mínimo 3 frentes.
6. Se teste falhar, diagnosticar/corrigir/retestar; não parar para pedir ajuda por falha técnica comum.
7. Só parar para Victor em dúvida realmente bloqueante, informação exclusiva dele/restaurante, credencial indisponível, ação irreversível não autorizada ou dependência externa comprovada.
8. Na conversa com Victor, falar sempre em português brasileiro claro. IDs internos podem existir no repositório, mas nunca comunicar apenas “T57”, “G7”, “PR #x” etc.
9. Multi-tenant é princípio arquitetural. Bella é configuração/tenant, não hardcode do núcleo.
10. Valores financeiros são calculados/validados no servidor. Nunca confiar no total enviado pelo cliente.
11. Operações críticas devem ser auditáveis e, quando necessário, idempotentes/transacionais.
12. Nunca commitar `.env`, tokens, chaves, dumps reais ou segredos.
13. Acesso amplo ao PC não autoriza vasculhar arquivos pessoais sem relação com o projeto.
14. Antes de compactar contexto, persistir toda memória necessária no repositório.

## Loop obrigatório de execução

Reconhecimento → Plano → Gate do Plano → Execução incremental → Testes locais → Verificação independente → Gate de Qualidade → Gate de Integração → Atualização da memória/docs → Revisão Git → Gate de Etapa → Próximo trabalho.

FAIL = corrigir e repetir. BLOCKED = somente condições humanas/externas realmente bloqueantes.

## Regra anti-falso-positivo/negativo

Nunca confie em uma única frente. Exemplos de frentes independentes:

- lint/typecheck/build;
- unit;
- integration;
- E2E browser;
- chamada real de API de teste;
- consulta independente ao banco;
- logs/correlation ids;
- permissão positiva + negativa;
- teste visual mobile;
- falha/timeout/retry;
- regressão adjacente.

`200 OK`, build verde ou “abriu na tela” isoladamente não provam conclusão.

## Gates resumidos

- Ambiente: repo/branch/remote/auth/baseline conhecidos.
- Plano: objetivo, impacto, riscos, teste e rollback claros.
- Dados: migration, constraints, contratos, integração e persistência provados.
- Feature: aceite + estados de erro/loading/vazio + evidência múltipla.
- Integração: cliente/cozinha/admin consistentes e sem duplicidade.
- UX: mobile real/responsivo + inspeção visual.
- Segurança: autenticação, autorização, tenant e negação testados.
- Financeiro: total reconstruível, centavos, auditoria, concorrência e ledger.
- KDS: roteamento, status, reconexão e não duplicidade.
- Release: regressão, migration limpa, backup/rollback, smoke e checkpoint.

Detalhes completos: `docs/BELLA_OS_AUTONOMOUS_HANDOFF.md`.

## Memória persistente

Arquivos obrigatórios:

- `CLAUDE.md` — regras + estado resumido + índice.
- `docs/PROJECT_STATE.md` — estado atual detalhado.
- `docs/ACTIVE_PLAN.md` — plano e próximo passo exato.
- `docs/DECISIONS.md` — decisões/ADRs.
- `docs/QA_LEDGER.md` — gates e evidências relevantes.
- `docs/KNOWN_ISSUES.md` — bugs, dívida e riscos.
- `docs/PRODUCT_NOTES.md` — descobertas e inovações.
- `docs/memory/archive/` — snapshots antigos.

## Compactação de contexto

Meta preventiva: checkpoint perto de ~80k tokens de sessão; 100k é limite duro desejado quando houver medição. Se não houver contador, compactar após 8–12 tarefas substanciais, troca de fase, antes de mecanismo de compactação, quando contexto começar a repetir, antes de release ou sempre que decisões importantes estejam apenas na conversa.

Antes de compactar:

1. revisar `git status`;
2. atualizar PROJECT_STATE;
3. atualizar ACTIVE_PLAN com próximo passo exato;
4. registrar decisões;
5. registrar QA/gates;
6. registrar issues/riscos;
7. registrar descobertas/inovações;
8. atualizar este CLAUDE.md;
9. registrar branch + commit;
10. criar checkpoint coerente;
11. compactar;
12. reler CLAUDE.md + PROJECT_STATE + ACTIVE_PLAN antes de continuar.

Mantenha este arquivo idealmente abaixo de ~12–15k tokens. Arquive histórico resolvido em `docs/memory/archive/` e mantenha links aqui.

## Estado atual

> Atualizar continuamente.

- Fase atual: [preencher]
- Ambiente: [preencher]
- Branch atual: [preencher]
- Último checkpoint: [preencher]
- Módulo em andamento: [preencher]
- Último gate aprovado: [preencher]
- Bloqueios: [nenhum / preencher]

## Próximo passo exato

> [preencher com uma ação concreta que outro agente conseguiria executar sem reler a conversa inteira]

## Arquitetura atual

> Manter apenas resumo de alto nível. Detalhes ficam em docs técnicos.

- Frontend: [preencher]
- Backend: [preencher]
- Banco: [preencher]
- Auth: [preencher]
- Realtime: [preencher]
- Hosting: [preencher]
- Observabilidade: [preencher]
- Testes: [preencher]

## Comandos oficiais

```bash
# atualizar assim que o projeto tiver comandos reais
# install:
# dev:
# lint:
# typecheck:
# test:
# test:integration:
# test:e2e:
# build:
```

## Comunicação com Victor

Ao falar com Victor, traduza estado técnico para impacto real:

- O que fiz.
- Como provei.
- Resultado.
- O que falta.
- Se ele precisa fazer algo e exatamente o quê.

Nunca use código interno como substituto da explicação.

## Fonte de verdade documental

- Handoff completo: `docs/BELLA_OS_AUTONOMOUS_HANDOFF.md`
- Contexto do produto: `docs/PRODUCT_CONTEXT.md`
- Estado: `docs/PROJECT_STATE.md`
- Plano: `docs/ACTIVE_PLAN.md`
- Decisões: `docs/DECISIONS.md`
- QA: `docs/QA_LEDGER.md`
- Problemas conhecidos: `docs/KNOWN_ISSUES.md`
- Produto/inovações: `docs/PRODUCT_NOTES.md`

Se documentos e código divergirem, investigar, obter evidências e atualizar a fonte desatualizada. Não ignorar contradição importante.
