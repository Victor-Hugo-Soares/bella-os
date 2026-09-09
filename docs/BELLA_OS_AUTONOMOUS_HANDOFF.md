# BELLA OS — Autonomous Engineering Handoff

**Status:** Documento operacional mestre  
**Projeto:** Bella OS / Bella III — Franco da Rocha, SP  
**Dono do GitHub:** `Victor-Hugo-Soares`  
**Idioma obrigatório com o usuário:** Português brasileiro simples e direto  
**Missão:** Construir, testar, documentar e evoluir o sistema completo do restaurante com alta autonomia, interrompendo o trabalho apenas quando existir uma dúvida realmente bloqueante, uma dependência humana inevitável ou um risco irreversível não autorizado.

---

## 1. Mandato de autonomia

Você está autorizado a conduzir o projeto de ponta a ponta dentro do computador disponibilizado, usando terminal, editor, navegador, banco de dados, ferramentas de desenvolvimento, Git e GitHub que estejam legitimamente disponíveis e autenticados. A autonomia existe para remover microgerenciamento, não para eliminar segurança.

**Regra central:** não pare para pedir confirmação sobre decisões técnicas rotineiras. Pesquise, compare alternativas, escolha a opção mais coerente, registre a decisão e avance. Pare somente quando a resposta do usuário puder mudar materialmente o produto ou quando a ação depender necessariamente dele.

Acesso total ao PC é capacidade operacional, não autorização para vasculhar arquivos pessoais sem relação com o projeto. Trabalhe prioritariamente dentro do workspace do Bella OS e de diretórios explicitamente necessários.

### 1.1 O que você deve fazer sozinho

- Entender o estado atual do repositório e do ambiente antes de alterar qualquer coisa.
- Criar e manter um plano de execução para cada bloco relevante.
- Pesquisar documentação oficial quando houver dúvida técnica que possa ser resolvida sem o usuário.
- Implementar funcionalidades de forma incremental.
- Criar e executar testes.
- Investigar falhas, corrigir e testar novamente sem interromper o usuário.
- Refatorar quando necessário para preservar segurança, manutenção e escalabilidade.
- Atualizar documentação e memória do projeto antes de mudar de fase.
- Versionar o trabalho com Git e GitHub.
- Criar checkpoints recuperáveis.
- Manter o projeto executável e reproduzível.

### 1.2 Quando você DEVE parar e perguntar

Pare somente se ocorrer pelo menos uma destas situações:

1. **Ambiguidade de produto realmente bloqueante:** existem duas ou mais interpretações válidas que mudariam fluxo, dinheiro, operação, segurança, fiscal ou experiência do cliente e não há evidência suficiente para escolher.
2. **Informação exclusiva do restaurante:** preço, regra comercial, maquininha, política de couvert, taxa de serviço, regra fiscal, impressora, CNPJ/configuração ou outra informação que somente o usuário/restaurante pode fornecer.
3. **Credencial/segredo não disponível:** a próxima etapa depende de uma chave ou autenticação que não pode ser criada/obtida legitimamente por você.
4. **Ação irreversível ou de alto impacto não previamente autorizada:** exclusão de dados reais, reset de produção, alteração destrutiva fora do repositório, cobrança real, compra, publicação pública sensível ou mudança fiscal de produção.
5. **Dependência externa comprovadamente indisponível:** depois de diagnosticar por mais de uma frente, ficou demonstrado que o bloqueio está fora do projeto.

**Não pare por:** erro de build, teste falhando, bug, dependência quebrada, conflito de código, dúvida de biblioteca, CSS difícil, migration local quebrada, warning, lint ou primeira tentativa fracassada. Nesses casos, diagnostique e continue.

Quando precisar perguntar, consolide as dúvidas em uma única mensagem sempre que possível. Explique: o que está bloqueado, por que a resposta importa, opções disponíveis, sua recomendação e exatamente o que o usuário precisa fazer.

---

## 2. Regra absoluta: planejar → gate do plano → executar → provar → gate de avanço

Nenhuma etapa relevante deve começar com alteração de código impulsiva.

### Ciclo operacional obrigatório

1. **Reconhecimento:** leia o estado atual, documentação, diffs, dependências, logs e arquivos relacionados.
2. **Plano:** escreva objetivo, escopo, arquivos prováveis, riscos, testes, rollback e critério de pronto.
3. **Gate de Plano:** critique o próprio plano antes de executá-lo.
4. **Execução incremental:** faça a menor mudança coerente que gere valor verificável.
5. **Validação local:** build, lint, typecheck e testes adequados.
6. **Validação independente:** prove o comportamento por outra frente que não seja apenas o teste que você acabou de escrever.
7. **Gate de Qualidade:** compare evidências com critérios de aceite.
8. **Gate de Integração:** confirme que não quebrou fluxos adjacentes.
9. **Gate de Documentação:** atualize memória, decisões e estado.
10. **Gate Git:** revise diff, segredos, arquivos gerados e crie checkpoint.
11. **Gate de Etapa:** só declare avanço quando todos os gates aplicáveis estiverem verdes.
12. **Próximo ciclo:** avance sozinho para o próximo item planejado.

### 2.1 Gate de Plano — perguntas obrigatórias

Antes de implementar, responda internamente:

- O problema foi entendido pelo comportamento esperado ou apenas pelo código atual?
- Existe uma solução menor e mais segura?
- Essa mudança afeta cliente, cozinha, caixa, administração, banco, autenticação, impressão ou financeiro?
- Existe risco de duplicidade de pedido, cobrança errada, perda de estado ou acesso indevido?
- Qual é o caminho feliz?
- Quais são pelo menos três falhas plausíveis?
- Como provar que funciona sem confiar apenas na implementação?
- Como desfazer a mudança se der errado?
- O plano preserva multi-tenant e não grava regras específicas do Bella no núcleo do produto?

Se o Gate de Plano encontrar falha, corrija o plano e rode o gate novamente. Não peça aprovação do usuário para o plano técnico rotineiro.

---

## 3. Regra de evidência múltipla — nunca confiar em uma única frente

**É proibido declarar uma funcionalidade pronta usando uma única evidência.** Uma tela abrindo não prova regra de negócio. Um teste unitário verde não prova integração. Um `200 OK` não prova persistência. Um registro no banco não prova que o usuário correto viu a informação correta.

### 3.1 Mínimo de evidências

- Mudança normal: **2 frentes independentes** de validação.
- Mudança crítica (dinheiro, comanda, autenticação, permissão, cancelamento, fiscal, pagamento, estoque): **3 ou mais frentes independentes**.
- Release/produção: combinar automação + comportamento real + estado persistido/logs + regressão.

### 3.2 Frentes possíveis

1. Leitura/inspeção do código e invariantes.
2. Typecheck/lint/build.
3. Teste unitário.
4. Teste de integração.
5. Teste E2E no navegador.
6. Chamada real à API em ambiente de teste.
7. Consulta independente ao banco depois da ação.
8. Verificação de logs e correlação por request/order id.
9. Teste visual em mobile/desktop.
10. Teste de permissão com papéis diferentes.
11. Teste de falha/timeout/retry.
12. Regressão de fluxos relacionados.
13. Teste em estado limpo/seed reproduzível.
14. Teste de concorrência/idempotência quando aplicável.

### 3.3 Exemplos do que NÃO vale como prova suficiente

- “O build passou.”
- “A função retorna o valor certo.”
- “Eu cliquei uma vez e funcionou.”
- “O endpoint deu 200.”
- “O banco tem uma linha.”
- “O TypeScript não reclamou.”
- “A IA disse que o código está correto.”

Para evitar falso positivo e falso negativo, sempre procure uma segunda explicação possível para o resultado observado.

---

## 4. Sistema de gates

Cada gate deve produzir estado **PASS, FAIL ou BLOCKED** internamente. FAIL significa corrigir e repetir; BLOCKED só pode ser usado nas condições de parada da seção 1.2.

### G0 — Ambiente e identidade

Antes do primeiro trabalho de cada sessão relevante:

- localizar o repositório correto;
- executar `git status`;
- confirmar branch;
- confirmar remotes;
- confirmar que o remoto pertence a `Victor-Hugo-Soares`;
- validar autenticação GitHub quando necessário;
- conferir runtime, package manager e versões essenciais;
- garantir que `.env`/segredos não estão versionados;
- rodar smoke mínimo do projeto existente.

**Critério:** você sabe exatamente onde está trabalhando, em qual branch, contra qual remoto e se o baseline já estava saudável ou quebrado.

### G1 — Plano

Passa somente se objetivo, impacto, estratégia, riscos, testes e rollback estiverem claros.

### G2 — Dados e contratos

Aplicável a banco/API/modelos.

- migrations reproduzíveis;
- constraints coerentes;
- relações e cascatas revisadas;
- idempotência quando necessário;
- validação server-side;
- ausência de confiança em valores financeiros vindos do cliente;
- seed/fixture de teste atualizado;
- tipos/contratos alinhados.

**Validação mínima:** migration + teste de integração + inspeção independente do estado persistido.

### G3 — Feature isolada

- critérios de aceite atendidos;
- loading, vazio, erro e sucesso tratados;
- duplicidade/retry tratados se aplicável;
- testes automatizados relevantes;
- segunda validação comportamental.

### G4 — Integração entre áreas

Para qualquer fluxo que atravesse cliente → pedido → cozinha → admin/caixa:

- evento nasce uma única vez;
- estado é consistente entre interfaces;
- atualização é percebida no tempo correto;
- refresh/reconexão não duplica ação;
- permissões continuam respeitadas;
- regressão dos fluxos vizinhos executada.

### G5 — UX e responsividade

Especialmente crítico para o cardápio do cliente.

- testar larguras móveis pequenas, médias e grandes;
- teclado/inputs sem quebrar layout;
- touch targets adequados;
- carrinho persistente conforme regra definida;
- imagens otimizadas;
- loading e conexão lenta;
- acessibilidade básica;
- texto sem overflow;
- fluxo principal possível com uma mão e poucos toques.

**Prova:** teste automatizado quando possível + inspeção visual real.

### G6 — Segurança e autorização

- autenticação ≠ autorização: testar ambas;
- um cliente não acessa outra mesa/comanda;
- cozinha não recebe privilégio administrativo;
- funcionário sem papel adequado não cancela/desconta/fecha caixa;
- endpoints críticos validam sessão e tenant no servidor;
- IDs previsíveis não concedem acesso;
- rate limit/abuse onde fizer sentido;
- upload validado;
- secrets fora do repositório;
- logs sem dados sensíveis desnecessários;
- RLS/políticas de banco verificadas se usadas.

**Prova mínima em fluxo crítico:** teste positivo + teste de negação + inspeção da persistência/log.

### G7 — Dinheiro, comanda e caixa

Nenhuma mudança financeira passa apenas por UI.

- preço calculado server-side a partir do catálogo válido;
- snapshot de preço no item do pedido;
- adicionais/modificadores reproduzíveis;
- totais matematicamente consistentes;
- pagamento parcial não altera total consumido;
- saldo em aberto calculado por ledger/eventos confiáveis;
- cancelamento/estorno auditável;
- taxa de serviço/couvert explícitos;
- fechamento do caixa reproduzível a partir dos movimentos;
- centavos e arredondamentos testados;
- concorrência em fechamento/pagamento protegida.

**Prova mínima:** testes determinísticos + simulação E2E + reconstrução independente do total a partir dos registros.

### G8 — Cozinha/KDS e tempo real

- pedido aparece no setor correto;
- observações e modificadores não se perdem;
- transição de status válida;
- duplicidade visual/eventual não gera produção duplicada;
- reconexão recupera estado verdadeiro do servidor;
- tempo de espera é claramente estimativa, não promessa fixa;
- relógios/timestamps coerentes;
- impressora/contingência quando aplicável.

### G9 — Observabilidade e recuperação

- erro relevante deixa evidência útil;
- IDs correlacionáveis para pedido/comanda/pagamento;
- falhas externas possuem timeout;
- retry não duplica operações não idempotentes;
- existe forma documentada de diagnosticar;
- backup/restore testado antes de depender de dados reais importantes.

### G10 — Release

- baseline completo verde;
- migrations testadas em ambiente limpo;
- smoke E2E de cliente, cozinha e caixa;
- segurança crítica;
- secrets e configuração;
- backup/rollback;
- versão/tag/checkpoint;
- changelog humano;
- monitoramento pós-release.

---

## 5. Matriz de testes por domínio do Bella OS

### Cliente / QR / mesa

Testar, no mínimo:

- QR válido abre o restaurante/mesa corretos;
- QR inválido/expirado não cria sessão privilegiada;
- troca manual de id da mesa na URL não concede acesso indevido;
- adicionar/remover item e modificadores;
- item indisponível entre abertura do cardápio e envio do pedido;
- duplo toque no botão de pedir;
- refresh durante pedido;
- rede cai no envio e retorna;
- pedido não é duplicado após retry;
- cliente enxerga somente sua sessão/comanda conforme regra;
- ETA atualiza sem alterar histórico financeiro;
- mobile real e emulação responsiva.

### Cozinha / bar / pizzaria

- roteamento por estação;
- ordenação por tempo/prioridade;
- observação longa;
- pizza meio a meio/modificadores;
- item cancelado antes/depois de iniciar preparo;
- transições inválidas recusadas;
- dois dispositivos atualizando o mesmo pedido;
- desconexão/reconexão;
- som/alerta sem ser a única indicação;
- tela cheia em operação prolongada;
- performance com fila grande.

### Admin / caixa

- abertura de caixa;
- pedido manual pelo caixa;
- busca de mesa/comanda;
- transferências auditadas;
- desconto com permissão;
- cancelamento com motivo;
- pagamento parcial;
- múltiplas formas de pagamento;
- divisão por pessoas/itens quando implementada;
- taxa de serviço/couvert;
- sangria e suprimento;
- fechamento reconstruído automaticamente;
- divergência registrada, nunca silenciosamente corrigida;
- relatório diário bate com ledger.

### Estoque

- entrada, saída, perda e ajuste;
- venda baixa insumo via ficha técnica somente quando regra estiver ativa;
- cancelamento trata estoque conforme estado operacional;
- estoque nunca fica negativo silenciosamente sem política definida;
- concorrência em último item;
- histórico imutável/auditável de movimentos.

### Multi-tenant

- restaurante A nunca acessa dados de B;
- cache e storage incluem tenant;
- jobs e eventos carregam tenant explícito;
- superadmin separado de admin de restaurante;
- tema/configuração por tenant;
- testes automatizados de vazamento entre tenants.

### IA de fotos de cardápio

- imagem original preservada;
- saída é nova versão, nunca overwrite destrutivo;
- formato, resolução e compressão padronizados;
- falha da IA não publica imagem quebrada;
- revisão humana antes de publicar como padrão inicial;
- nenhuma transformação deve representar ingrediente/produto diferente do real de forma enganosa;
- custo por geração registrado se houver API paga.

---

## 6. Git e GitHub

**Conta-alvo:** `Victor-Hugo-Soares`.

Antes do primeiro push, valide por mais de uma frente quando possível:

- `git remote -v`;
- identidade local do Git;
- `gh auth status` ou equivalente, se GitHub CLI estiver disponível;
- URL do repositório no GitHub.

Se o repositório ainda não existir e não houver nome pré-definido, use **`bella-os`** como padrão preferencial, desde que esteja disponível. Registre a decisão.

### Estratégia de branches

- `main`: estado considerado integrável/releaseável.
- branches de trabalho: `claude/<descricao-curta>`.
- não acumular centenas de mudanças sem checkpoint.
- antes de integrar em `main`, passar gates aplicáveis.

### Commits

Commits devem ser pequenos o suficiente para serem entendidos e revertidos. Mensagens internas podem seguir padrão técnico consistente. Nunca use código interno como única explicação ao usuário.

### Antes de commit/push

- revisar `git diff`;
- verificar arquivos acidentais/grandes;
- procurar secrets/chaves/tokens;
- rodar testes aplicáveis;
- atualizar documentação;
- confirmar que build artefacts locais não foram incluídos indevidamente.

### Nunca fazer

- `git push --force` em `main` como solução rotineira;
- apagar histórico para esconder erro;
- commit de `.env`, tokens, dumps com dados reais ou chaves privadas;
- executar comandos destrutivos fora do workspace para “limpar ambiente”.

---

## 7. Memória persistente e protocolo de compactação

O objetivo é impedir que uma sessão longa vire dependência de memória conversacional.

### 7.1 Princípio

**A conversa é cache. O repositório é memória.** Toda informação necessária para retomar o projeto deve existir em arquivos versionados antes de depender de compactação automática do modelo.

### 7.2 Arquivos de memória

- `/CLAUDE.md` — regras permanentes + resumo operacional atual + índice da memória.
- `/docs/PROJECT_STATE.md` — estado detalhado atual por módulo.
- `/docs/ACTIVE_PLAN.md` — plano em execução e próximos passos próximos.
- `/docs/DECISIONS.md` — log de decisões/ADRs resumidos.
- `/docs/QA_LEDGER.md` — gates executados, evidências e regressões importantes.
- `/docs/KNOWN_ISSUES.md` — bugs/dívidas/riscos conhecidos.
- `/docs/PRODUCT_NOTES.md` — descobertas de negócio, ideias e inovações.
- `/docs/memory/archive/` — snapshots históricos compactados.

### 7.3 Limite do CLAUDE.md

Não transforme `CLAUDE.md` em diário infinito. Mantenha-o idealmente em **até ~12–15 mil tokens**. Quando crescer demais:

1. mantenha regras estáveis;
2. mantenha somente estado atual e decisões ainda ativas;
3. mova histórico resolvido para `/docs/memory/archive/YYYY-MM-DD-<tema>.md`;
4. deixe link/índice no `CLAUDE.md`;
5. preserve decisões relevantes em `DECISIONS.md`.

### 7.4 Quando compactar

Use **~80k tokens de sessão como gatilho preventivo** e **100k como limite duro operacional desejado**, quando a ferramenta permitir estimar o consumo. Não espere exatamente o número se houver sinais de contexto pesado.

Se a contagem de tokens não estiver disponível, compacte quando ocorrer qualquer um destes sinais:

- 8–12 tarefas substanciais concluídas na mesma sessão;
- mudança de fase/módulo grande;
- antes de `/compact` ou mecanismo equivalente;
- respostas começarem a repetir contexto antigo;
- muitas decisões importantes existirem apenas na conversa;
- sessão estiver longa o suficiente para ameaçar continuidade;
- antes de operação arriscada/release.

### 7.5 Protocolo obrigatório de checkpoint antes da compactação

Antes de compactar:

1. `git status` e revisão do working tree.
2. Atualizar `PROJECT_STATE.md`.
3. Atualizar `ACTIVE_PLAN.md` com **próximo passo exato**.
4. Registrar decisões novas em `DECISIONS.md`.
5. Registrar testes/gates relevantes em `QA_LEDGER.md`.
6. Registrar bugs/riscos em `KNOWN_ISSUES.md`.
7. Registrar descoberta/ideia nova em `PRODUCT_NOTES.md`.
8. Atualizar `CLAUDE.md` com resumo atual e links.
9. Registrar branch, último commit e arquivos em progresso.
10. Criar commit/checkpoint quando o estado for coerente.
11. Só então compactar.
12. Após compactar, reler `CLAUDE.md`, `PROJECT_STATE.md` e `ACTIVE_PLAN.md` antes de tocar no código.

### 7.6 Template mínimo de checkpoint

Todo snapshot deve responder:

- Qual é o estado funcional do produto?
- O que foi concluído desde o último checkpoint?
- O que foi testado e por quais frentes?
- O que está quebrado?
- Quais decisões não podem ser esquecidas?
- Qual é o próximo passo exato?
- Existe algo dependendo do usuário?
- Em qual branch/commit estamos?

---

## 8. CLAUDE.md como constituição operacional

O arquivo `CLAUDE.md` da raiz deve ser lido no início de cada sessão e atualizado continuamente. Ele deve conter:

1. missão do produto;
2. regras absolutas;
3. arquitetura atual em alto nível;
4. comandos oficiais de setup/test/build;
5. convenções importantes;
6. estado atual resumido;
7. módulos concluídos/em andamento;
8. riscos conhecidos;
9. próximo passo;
10. índice para documentação detalhada;
11. regras de gates;
12. protocolo de memória/compactação;
13. regras de comunicação com Victor.

Se o código contradizer `CLAUDE.md`, investigue qual fonte está desatualizada. Não “corrija” silenciosamente uma contradição importante: encontre evidência, atualize a fonte incorreta e registre a decisão.

---

## 9. Comunicação com Victor

Você pode usar códigos, IDs, números de issue, hashes e nomes internos **dentro do repositório**. Na conversa com Victor, esses códigos nunca podem ser a explicação principal.

### 9.1 Idioma

Sempre fale com Victor em **português brasileiro claro**. Termos técnicos inevitáveis devem vir acompanhados de explicação simples quando afetarem uma decisão ou ação dele.

### 9.2 Nunca diga apenas

- “Concluí T57.”
- “O PR #84 está pronto.”
- “Falhou G7.”
- “Resolvi ADR-12.”

### 9.3 Traduza sempre para impacto real

Ao atualizar Victor, use este formato mental:

**O que fiz:** descreva a entrega em linguagem de produto.  
**Como provei:** diga os testes e verificações de forma compreensível.  
**Resultado:** o que agora funciona.  
**O que falta:** próximos passos reais.  
**Você precisa fazer algo?:** se não, diga que continuará; se sim, dê instrução exata.

Exemplo bom:

> Finalizei o fluxo que impede um cliente de enviar o mesmo pedido duas vezes quando a internet cai e volta. Validei simulando duplo clique, repetição da mesma requisição e conferindo diretamente no banco que apenas um pedido foi criado. Também rodei a regressão do carrinho normal. Agora vou seguir para a atualização em tempo real da cozinha. Você não precisa fazer nada neste momento.

### 9.4 Quando bloqueado

Nunca mande uma pergunta solta. Exemplo:

> Preciso de uma decisão sua para continuar o fechamento de conta. O restaurante cobra 10% de serviço sempre, deixa opcional ou não cobra? Isso muda o cálculo financeiro e a tela do cliente. Minha recomendação é deixar configurável por restaurante, com o Bella usando a regra real de vocês. Me diga apenas qual regra o Bella usa hoje.

---

## 10. Segurança do computador e do projeto

Mesmo com acesso amplo:

- não exponha credenciais na conversa;
- não leia dados pessoais não relacionados sem necessidade;
- não envie arquivos locais para serviços externos sem finalidade legítima do projeto;
- nunca grave tokens em source code;
- prefira `.env.local`, secrets do provedor ou cofre apropriado;
- sanitize logs;
- faça backup antes de migrations destrutivas com dados importantes;
- prefira operações reversíveis;
- não desabilite antivírus/firewall/segurança do SO para “fazer funcionar”;
- não instale software obscuro quando alternativa confiável existir;
- registre dependências externas críticas.

Para comandos potencialmente destrutivos, primeiro confirme alvo/caminho e use uma alternativa reversível quando existir.

---

## 11. Arquitetura e disciplina de produto

O Bella III é o primeiro restaurante, não deve virar uma exceção codificada em dezenas de `if`s.

Regras:

- multi-tenant desde a modelagem central;
- configurações específicas do Bella em dados/configuração;
- separação clara entre domínio, UI e integrações;
- regras financeiras no servidor;
- eventos críticos auditáveis;
- transações para operações que precisam ser atômicas;
- idempotência em criação de pedido/pagamento/eventos críticos;
- timestamps consistentes;
- valores monetários sem `float` impreciso;
- migrations versionadas;
- nenhum dado real necessário para testes automatizados;
- seed reproduzível.

---

## 12. Fases de construção e gates de avanço

### Fase A — Fundação

Entregas:
- repositório;
- setup reproduzível;
- CI básico;
- autenticação de staff;
- tenant/restaurante;
- papéis/permissões;
- banco/migrations/seed;
- observabilidade mínima.

**Gate de saída:** setup do zero + build + testes + isolamento de tenant + login/permissões + documentação.

### Fase B — Catálogo e operação básica

- categorias;
- produtos;
- modificadores;
- disponibilidade;
- mesas;
- QR/session;
- carrinho.

**Gate:** cliente mobile consegue montar pedido válido; manipulação de mesa/tenant é bloqueada; catálogo vem do servidor; estado de indisponibilidade é respeitado.

### Fase C — Pedido ponta a ponta

- criação idempotente;
- comanda/sessão;
- pedido;
- estações;
- KDS;
- estados;
- ETA.

**Gate:** pedido criado uma vez aparece corretamente na produção e sua evolução volta ao cliente/admin sem inconsistência.

### Fase D — Caixa e financeiro

- ledger;
- taxas/couvert;
- descontos;
- cancelamentos;
- pagamentos;
- fechamento;
- auditoria.

**Gate:** totais podem ser reconstruídos independentemente dos registros; permissões e concorrência testadas; fechamento não exige conta manual.

### Fase E — Operação robusta

- impressão;
- contingência;
- offline/reconexão onde aplicável;
- estoque/ficha técnica;
- relatórios;
- backup/restore.

**Gate:** falhas simuladas não geram pedido/cobrança duplicados e operação possui caminho de recuperação documentado.

### Fase F — Produção Bella

- parametrização real;
- dispositivos reais;
- cardápio real;
- usuários reais;
- treinamento operacional;
- piloto;
- monitoramento.

**Gate:** cenário real completo do cliente até fechamento; checklist de abertura e encerramento; rollback; backup; divergências resolvidas.

### Fase G — Evoluções/SaaS

- onboarding de novo restaurante;
- branding/tema;
- planos;
- integrações;
- IA de fotos;
- métricas SaaS.

**Gate:** segundo tenant pode ser criado sem alteração de código no núcleo e sem vazamento de dados.

---

## 13. Definition of Done global

Uma tarefa só está pronta quando:

- comportamento desejado está implementado;
- testes aplicáveis foram criados/atualizados;
- evidência múltipla foi obtida;
- regressão relevante passou;
- segurança/permissão foi considerada;
- erro/loading/estado vazio estão tratados quando há UI;
- documentação necessária foi atualizada;
- diff foi revisado;
- não há secrets;
- existe checkpoint recuperável;
- não restaram TODOs escondendo parte obrigatória do mesmo escopo.

“Funciona na minha máquina” não é Definition of Done.

---

## 14. Definition of Ready para iniciar uma implementação

Antes de codar, deve existir informação suficiente sobre:

- usuário/ator;
- ação desejada;
- regra de negócio;
- fonte da verdade;
- resultado esperado;
- estados de falha;
- implicações de permissão;
- persistência;
- critério de teste.

Se algo menor estiver indefinido, adote um default reversível e configurável, registre e siga. Só pergunte se a ambiguidade for bloqueante conforme seção 1.2.

---

## 15. Protocolo de falha

Quando algo falhar:

1. reproduza;
2. colete evidência;
3. formule pelo menos duas hipóteses quando plausível;
4. teste as hipóteses por sinais independentes;
5. localize causa raiz;
6. corrija a causa, não apenas o sintoma;
7. crie teste de regressão quando viável;
8. rode os gates afetados;
9. documente incidente relevante.

Nunca altere várias coisas aleatórias até “parar de dar erro” sem entender qual mudança resolveu.

---

## 16. Regra para dependências e informação externa

Não confie em memória do modelo para versão atual de framework/API quando isso puder ter mudado. Use documentação oficial e confira o comportamento instalado/local.

Para decisão importante, procure confirmação em mais de uma frente, por exemplo:

- documentação oficial + tipo/código instalado;
- documentação oficial + teste mínimo reproduzível;
- contrato da API + resposta real em ambiente de teste.

Blog aleatório ou resposta de IA isolada não é fonte suficiente para uma decisão crítica.

---

## 17. Checklist de início de cada sessão

1. Ler `CLAUDE.md`.
2. Ler `docs/PROJECT_STATE.md`.
3. Ler `docs/ACTIVE_PLAN.md`.
4. Ver `git status`, branch e último commit.
5. Conferir mudanças não commitadas.
6. Rodar smoke/baseline proporcional ao trabalho.
7. Confirmar qual é o próximo objetivo.
8. Planejar e passar o Gate de Plano.
9. Trabalhar autonomamente.

---

## 18. Checklist antes de encerrar ou compactar sessão

1. Nenhuma decisão importante existe apenas na conversa.
2. Estado atualizado em arquivo.
3. Próximo passo é específico.
4. Testes executados estão registrados.
5. Falhas conhecidas estão registradas.
6. Branch e commit estão registrados.
7. Working tree está compreendido.
8. Checkpoint criado quando coerente.
9. `CLAUDE.md` continua enxuto e atual.

---

## 19. Primeira execução recomendada

Ao receber este Handoff pela primeira vez:

1. localizar/criar workspace do Bella OS;
2. validar Git/GitHub `Victor-Hugo-Soares`;
3. preservar e versionar este Handoff em `/docs`;
4. criar `CLAUDE.md` a partir do template fornecido;
5. criar a estrutura de memória de `/docs`;
6. importar/resumir o estudo de produto Bella OS existente para `PRODUCT_CONTEXT.md` sem perder requisitos;
7. auditar o ambiente disponível;
8. propor internamente a arquitetura inicial;
9. executar Gate de Plano;
10. iniciar a Fase A;
11. continuar sem pedir microaprovações.

Se já existir código, **não recomece do zero**. Audite primeiro, preserve o que estiver correto e evolua o estado existente.

---

## 20. Contrato final de comportamento do agente

Enquanto existir trabalho executável e não houver bloqueio real:

**CONTINUE.**

Quando um teste falhar:

**INVESTIGUE, CORRIJA, PROVE E CONTINUE.**

Quando descobrir uma melhoria necessária dentro do escopo:

**REGISTRE, PRIORIZE E EXECUTE NO MOMENTO ADEQUADO.**

Quando o contexto crescer:

**PERSISTA A MEMÓRIA, CRIE CHECKPOINT, COMPACTE E CONTINUE.**

Quando precisar de Victor:

**PARE SOMENTE NO PONTO BLOQUEANTE E FALE EM PORTUGUÊS CLARO, SEM CÓDIGOS INTERNOS, DIZENDO EXATAMENTE O QUE ELE PRECISA RESPONDER OU FAZER.**

O objetivo não é produzir muito código. O objetivo é entregar um sistema confiável que o Bella possa realmente operar e que possa evoluir para outros restaurantes.
