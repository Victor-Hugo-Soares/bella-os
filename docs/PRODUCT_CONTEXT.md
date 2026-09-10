# Bella OS — Contexto de Produto

> Fonte de verdade sobre **o que** estamos construindo e **por quê**. Consolidado em 2026-09-09 a partir do handoff, do briefing inicial do Victor e da análise de operação de restaurante. Quando uma regra de negócio do Bella for confirmada pelo Victor, atualize aqui e em `DECISIONS.md`.

## 1. Visão

Bella OS é um **sistema operacional de restaurante**: cliente pede pelo celular via QR Code na mesa, a produção (cozinha, pizzaria, bar) recebe em tempo real num painel (KDS), e a administração/caixa controla mesas, comandas, pagamentos, caixa, cardápio, estoque e relatórios.

- **Primeiro cliente e laboratório:** Bella III (Bella 3), Franco da Rocha/SP.
- **Direção de longo prazo:** produto SaaS multi-restaurante. O Bella é o primeiro *tenant*, nunca um caso especial no código.
- **Critério de sucesso real:** operar uma sexta-feira lotada no Bella sem pedido perdido, sem pedido duplicado, sem conta errada e sem a equipe precisar "lembrar de cabeça".

## 2. O que já sabemos e o que ainda não sabemos sobre o Bella

**Sabemos (do briefing):** restaurante em Franco da Rocha/SP; terá cozinha e possivelmente pizzaria e bar como estações separadas; quer pedido pelo QR na mesa; quer KDS; quer administração completa incluindo estoque, ficha técnica e CMV; quer no futuro fotos de cardápio padronizadas por IA.

**Não sabemos (perguntas abertas, cada uma tem default reversível — ver seção 9):**

| # | Pergunta | Por que importa | Default adotado até resposta |
|---|----------|-----------------|------------------------------|
| Q1 | Comanda é **por mesa** ou **por pessoa** (cartão individual)? | Muda modelo de fechamento e divisão de conta | Sessão de mesa com 1..n comandas; padrão 1 comanda por mesa, divisão por item/pessoa opcional |
| Q2 | Taxa de serviço: 10% sempre, opcional, ou não cobra? | Cálculo financeiro e tela do cliente | Configurável por tenant; Bella inicia com 10% **opcional** (cliente pode retirar no caixa) |
| Q3 | Cobra couvert (artístico/de entrada)? Por pessoa? | Ledger e tela | Configurável; desativado por padrão |
| Q4 | Quem "abre a mesa": garçom ou o próprio cliente ao escanear? | Segurança contra QR escaneado fora do restaurante e prank | Cliente pode abrir; **primeiro pedido da sessão exige confirmação do salão** (configurável) |
| Q5 | Como emite documento fiscal hoje (SAT, NFC-e, nada, ECF antigo)? | Obrigação legal em SP; integração é fase posterior | Fora do MVP; caixa exporta fechamento. Nunca prometer emissão fiscal até decidir |
| Q6 | Como recebe pagamento hoje (maquininha própria, TEF, PIX estático, dinheiro)? | Define se registramos pagamento manualmente ou integramos PSP | **Confirmado pelo Victor em 2026-09-10:** pagamento continua na maquininha de cartão física do Bella III, fora do sistema. O ADMIN faz a baixa manual no sistema (registra que a comanda foi paga, por qual forma). **Sem integração de PSP/TEF no MVP** — nem no M13. |
| Q7 | Cozinha quer **papel** (impressora térmica) além da tela? | Impressão exige agente local; muda Fase E | **Confirmado pelo Victor em 2026-09-10: por enquanto só tela.** Sem impressora térmica — M16 (`ROADMAP.md`, "Impressão") fica sem data, não é trabalho ativo a menos que ele peça de novo. |
| Q8 | Pizza meio a meio: cobra a mais cara ou a média? | Regra de preço | Configurável; padrão **mais cara** |
| Q9 | Horário de funcionamento e "virada do dia operacional" (ex.: fecha às 2h)? | Relatórios por dia operacional, não por dia-calendário | Dia operacional vira às **05:00** America/Sao_Paulo |
| Q10 | Cardápio real (categorias, itens, preços, adicionais) | Seed real da Fase F | Seed fictício realista até receber |
| Q11 | Número de mesas, áreas (salão, varanda), capacidade | Cadastro inicial | Seed com 20 mesas |
| Q12 | Equipe: quantos garçons, caixas, cozinheiros; alguém compartilha dispositivo? | Modelo de dispositivo compartilhado + PIN | Login por dispositivo + PIN de operador (Fase A/B) |
| Q13 | Internet do restaurante: fibra? Wi-Fi para clientes? Tem 4G de contingência? | Estratégia offline e recomendação de roteador failover | Assumir internet única sem redundância; recomendar failover 4G |
| Q14 | O repositório GitHub deve ser público? | Produto comercial; código público expõe estratégia | Recomendação: **privado**. Hoje está público |

## 3. Personas

| Persona | Contexto | O que precisa | Dor que resolvemos |
|---------|----------|---------------|--------------------|
| **Cliente na mesa** | Celular próprio, 4G ou Wi-Fi do restaurante, às vezes com pressa ou com grupo grande | Ver cardápio com fotos, montar pedido com adicionais e observações, saber quanto falta, ver consumo, pedir conta, chamar garçom | Esperar garçom, erro de anotação, não saber o total, não saber se o pedido "foi" |
| **Garçom / salão** | Em pé, andando, mãos ocupadas, ruído | Saber o que está pronto e para onde levar, confirmar mesa aberta, lançar pedido pelo cliente que não usa celular, transferir mesa, dividir conta | Decorar pedidos, ida e volta à cozinha, item pronto esfriando |
| **Cozinha / pizzaria / bar** | Tela de 10"–24" a ~1,5 m, mãos sujas/molhadas, barulho, calor | Fila clara por estação, tempo decorrido, observações legíveis, "esgotar item" imediato, bump em um toque | Papel perdido, comandas ilegíveis, esquecer prioridade, produzir item cancelado |
| **Caixa** | Balcão, PC ou tablet, filas no fechamento | Ver conta da mesa, aplicar desconto com permissão, registrar pagamentos parciais em múltiplas formas, fechar comanda, sangria/suprimento, fechar caixa sem calculadora | Conta errada, divergência de caixa, não saber quem cancelou o quê |
| **Gerente / dono** | Dentro e fora do restaurante, celular ou notebook | Faturamento do dia, ticket médio, mais vendidos, horários de pico, cancelamentos, descontos, CMV, estoque, permissões, auditoria | Não saber onde perde dinheiro; depender de planilha |
| **Superadmin (nós)** | Operador da plataforma | Criar tenant, configurar, suportar, ver saúde do sistema | Onboarding manual e vazamento entre clientes |

## 4. Jornadas principais

### 4.1 Cliente (mobile via QR)
1. Escaneia QR fixo colado na mesa → abre `/{restaurante}/m/{código-da-mesa}`.
2. Se a mesa está **fechada**, o sistema abre uma sessão de mesa (ou pede que chame o garçom, conforme configuração). Se já está aberta, o celular se junta à sessão.
3. Vê cardápio (categorias, busca, fotos, indisponíveis marcados), abre produto, escolhe variação/adicionais/observação, adiciona ao carrinho. Carrinho persiste no celular (localStorage) enquanto a sessão estiver aberta.
4. Envia pedido → **um** pedido é criado (idempotência), com itens roteados para estações.
5. Acompanha status por item (recebido → preparando → pronto → entregue) e estimativa de espera **como faixa** ("15–25 min"), nunca como promessa.
6. Faz novos pedidos ao longo da noite; vê consumo acumulado da mesa (e o seu próprio, se identificado).
7. Chama garçom / pede a conta pelo app. Escolhe (quando habilitado) se paga tudo, divide por igual ou por itens. Pagamento em si acontece com o caixa/garçom (MVP).
8. Sessão fecha quando o caixa encerra a comanda. O QR volta a estar "livre".

### 4.2 Produção (KDS)
1. Dispositivo registrado como "Cozinha", "Pizzaria" ou "Bar" (uma tela pode mostrar várias estações).
2. Ticket entra com som + destaque, ordenado por tempo (mais antigo primeiro), com mesa, itens, quantidades, modificadores e observações em fonte grande.
3. Toque: "Iniciar" → "Pronto" (bump). Recall de ticket bumpado por engano. Ticket cancelado aparece riscado com alerta se já estava em produção.
4. "Esgotar item" tira o produto do cardápio do cliente na hora.
5. Se a conexão cair: banner de "sem conexão", tela congela no último estado verdadeiro, nenhuma ação é aceita até reconectar; ao reconectar, recarrega do servidor (nunca confia em estado local).

### 4.3 Salão / expedição
- Lista de itens **prontos** por mesa para entregar; marca "entregue" (fecha o ciclo e alimenta o status do cliente).
- Chamados de mesa (garçom / conta) em fila com tempo de espera.
- Confirma sessão de mesa aberta por cliente (anti-prank) quando a configuração exigir.
- Lança pedido em nome da mesa (mesma UI do cardápio em "modo equipe").

### 4.4 Caixa
1. Abre caixa (fundo de troco). 2. Ao longo do turno registra pagamentos por comanda (dinheiro, débito, crédito, PIX, voucher), parciais e múltiplos. 3. Aplica desconto / cancela item com motivo e permissão. 4. Fecha comanda quando saldo = 0. 5. Sangria/suprimento. 6. Fecha caixa: sistema calcula esperado por forma de pagamento a partir do ledger; operador informa contado; divergência é **registrada**, nunca ajustada em silêncio.

### 4.5 Administração
- Cardápio: categorias, produtos, variações, grupos de adicionais, estações, disponibilidade, fotos.
- Mesas e QR: cadastro, geração de PDF dos QRs para impressão física.
- Equipe: usuários, papéis, permissões, PIN, dispositivos.
- Configurações: taxa de serviço, couvert, modo de confirmação de pedido, regra de meio a meio, dia operacional, impressoras.
- Relatórios: faturamento por dia operacional, ticket médio, mais vendidos, horários, cancelamentos/descontos por operador, tempo de produção por estação.
- Estoque (Fase E): insumos, ficha técnica, movimentos, CMV.
- Auditoria: quem fez o quê, quando, antes/depois.

## 5. Escopo

### MVP operacional (Fases A–D do handoff)
Cliente QR + cardápio + carrinho + pedido idempotente; sessão de mesa e comandas; KDS por estação em tempo real com status; acompanhamento e estimativa; expedição (itens prontos); chamado de garçom / pedir conta; admin de cardápio, mesas, QR, equipe, permissões; caixa com ledger, pagamentos manuais multi-forma, descontos, cancelamentos, fechamento de comanda, sessão de caixa; relatórios básicos; auditoria; multi-tenant desde a primeira migration.

### Pós-MVP (Fases E–G)
Impressão térmica via agente local; contingência/degradação; estoque + ficha técnica + CMV; relatórios avançados; backup/restore automatizado; divisão de conta avançada; pagamento pelo celular (PIX dinâmico via PSP); fiscal (SAT/NFC-e) após decisão; onboarding self-service de tenant; temas/white-label; IA de fotos de cardápio; app do garçom nativo; integrações (iFood etc.).

### Não-objetivos explícitos agora
Delivery próprio, fidelidade, reservas, CRM, marketing, integração fiscal, integração de maquininha (TEF), app nativo. A arquitetura não pode impedir esses itens (por exemplo, `orders.source` já comporta `delivery`), mas nenhum código deles entra no MVP.

## 6. Princípios de produto

1. **Confiança acima de feature.** Um pedido a menos na tela é melhor que um pedido duplicado na cozinha.
2. **Servidor é a verdade.** Preço, total, status e estoque vêm do servidor; o cliente só exibe.
3. **Nada silencioso.** Cancelamento, desconto, divergência de caixa e transferência têm autor, motivo e horário.
4. **Feito para mão suja e tela pequena.** Toques grandes, poucos passos, fonte legível a 1,5 m no KDS, uma mão no celular.
5. **Estimativa é estimativa.** Sempre faixa, sempre rotulada como estimativa.
6. **Bella é configuração.** Qualquer "no Bella é assim" vira campo de configuração do tenant, nunca `if`.
7. **Português do Brasil, tom profissional**, sem emoji na interface.

## 7. Requisitos que o briefing não citou e consideramos necessários

Detalhados e classificados em `PRODUCT_NOTES.md`. Resumo dos **essenciais** adicionados ao MVP:
- chamar garçom e pedir a conta pelo celular;
- lista de itens prontos para entrega (expedição) e confirmação de entrega;
- "esgotar item" a partir do KDS;
- confirmação de sessão de mesa aberta por cliente (anti-QR remoto);
- geração de PDF de QR Codes das mesas;
- registro de dispositivos (tablet da cozinha, PC do caixa) e PIN de operador;
- transferência de mesa/comanda e junção de mesas;
- dia operacional configurável para relatórios;
- pedido lançado pela equipe em nome da mesa;
- chips de observações comuns ("sem cebola") por produto.

## 8. Referência de trabalho anterior do Victor

Repositório público `Victor-Hugo-Soares/qiosk`: PWA de totem de autoatendimento para hamburguerias (React + Vite, estado só em localStorage, sem backend; três interfaces no mesmo app: totem, cozinha em kanban de 3 colunas com cores de urgência, admin). Lições aproveitadas: três superfícies num só front funcionam bem; kanban por tempo com cor de urgência é bom para KDS; grupos de extras com `required/multiple`. Lição a **não repetir**: estado local como fonte de verdade (impossível para multi-dispositivo, dinheiro e auditoria). Nenhum código é reaproveitado; a estética também não (Bella OS segue `FRONTEND_GUIDELINES.md`).

## 9. Regra para perguntas abertas

Toda pergunta da seção 2 tem um default **configurável e reversível**. Sonnet deve implementar o default, registrar em `KNOWN_ISSUES.md` como "aguardando confirmação do Bella" e seguir. Só perguntar ao Victor quando a implementação chegar ao ponto em que a resposta muda o que será construído a seguir (por exemplo, Q1 antes da Fase D, Q5 antes de qualquer promessa fiscal, Q10/Q11 na Fase F).
