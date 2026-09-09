# Bella OS — Notas de Produto, Melhorias e Inovações

> Ideias e requisitos descobertos na análise. Classificação: **essencial** (entra no MVP), **importante** (logo após MVP), **oportunidade** (diferencial), **futuro**, **não recomendado**. Nada aqui é implementado automaticamente; entra no roadmap quando priorizado.

## Essenciais (já incorporados ao roadmap MVP)

| Ideia | Problema que resolve | Impacto | Complexidade | Quando | Riscos |
|-------|----------------------|---------|--------------|--------|--------|
| Chamar garçom / pedir a conta pelo celular | cliente esperando sem ser visto | alto | baixa | M10 | spam de chamados → rate limit por sessão |
| Lista de itens prontos + "entregue" (expedição) | item pronto esfriando; status do cliente nunca chega a "entregue" | alto | baixa | M10 | garçom esquece de marcar → lembrete visual por tempo |
| "Esgotar item" no KDS | cliente pede o que acabou | alto | baixa | M9 | esquecer de reativar → lembrete na abertura do dia |
| Confirmação de sessão aberta por cliente (anti-QR remoto) | pedido falso/prank a partir de QR fotografado | alto | média | M6/M10 | atrito no primeiro pedido → configurável |
| PDF de QR Codes das mesas | sem isso o QR não chega à mesa | alto | baixa | M6 | — |
| Dispositivos pareados + PIN de operador | ninguém digita e-mail/senha no rush; responsabilidade individual | alto | média | M3 | PIN compartilhado → auditoria por PIN + bloqueio |
| Transferência de mesa, junção de mesas, mover itens entre comandas | operação real de salão | alto | média | M11 | inconsistência financeira → transações + ledger `transfer_in/out` |
| Dia operacional configurável | relatório do "sábado" que termina às 2h de domingo | médio | baixa | M1 (config) / M14 | — |
| Pedido lançado pela equipe em nome da mesa | cliente sem celular/bateria; idosos | alto | baixa (reusa UI) | M11 | — |
| Chips de observações comuns por produto ("sem cebola", "bem passado") | digitação no celular; erros de leitura na cozinha | médio | baixa | M5/M7 | — |
| `price_changed` no envio do pedido | preço alterado entre cardápio e envio | médio | baixa | M8 | — |

## Importantes (Fase E / logo após)

| Ideia | Problema | Impacto | Complexidade | Quando |
|-------|----------|---------|--------------|--------|
| Impressão térmica via agente local (ESC/POS) com fila e reimpressão | cozinha que precisa de papel; contingência de tela | alto | alta | M16 |
| Fechamento "cego" de caixa (operador conta antes de ver o esperado) | manipulação da contagem | médio | baixa | M14 (flag `blind_close`) |
| Contagem "all day" no KDS (quantas pizzas X pendentes no total) | pizzaria/cozinha produz em lote | médio | baixa | M9.5 |
| Recall de ticket e histórico de bumpados nos últimos 30 min | bump acidental | médio | baixa | M9 |
| Cardápio por horário (almoço/noite) e happy hour | operação com turnos | médio | média | pós-D |
| Rateio da taxa de serviço por garçom / turno | pagamento da equipe | médio | média | pós-D |
| Alérgenos e filtros (vegetariano, sem glúten) | segurança alimentar | médio | baixa | M5 |
| Tempo real de produção por estação (métrica) e calibração da estimativa por histórico | ETA honesta | médio | média | M14/E |
| Lembretes operacionais: itens esgotados ainda desativados na abertura, mesas abertas há > 3 h sem pedido, chamados sem resposta > 5 min | esquecimentos | médio | baixa | E |
| Backup diário para bucket + teste de restore trimestral | perda de dados | alto | baixa | M18 |

## Oportunidades (diferenciais)

| Ideia | Problema | Impacto | Complexidade | Quando | Riscos |
|-------|----------|---------|--------------|--------|--------|
| Pagamento pelo celular (PIX dinâmico via PSP; Victor já usa Asaas em outro projeto) | fila no caixa; mesa presa esperando conta | alto | média | M27 | conciliação, webhook idempotente, taxa do PSP |
| Divisão de conta por pessoa usando `guests` (quem pediu o quê) | briga da conta | alto | média | M15 | itens compartilhados → divisão manual |
| Curso/sequenciamento ("segurar prato até entrada sair"; "disparar sobremesa") | ritmo de serviço em restaurante de mesa | médio | média | E | complexidade no KDS |
| Modo "cliente sem app": garçom lança e cliente acompanha via QR mesmo assim | inclusão | médio | baixa | M11 | — |
| Feedback rápido ao fechar (1–5 estrelas + comentário) por sessão | qualidade sem intrusão | médio | baixa | G | LGPD mínima |
| Onboarding self-service de restaurante com cardápio importado de planilha/foto (IA) | tempo de implantação SaaS | alto | alta | G | qualidade da extração |
| IA de fotos padronizadas do cardápio (requisito do Victor) | fotos amadoras | médio | média | M28 | representação enganosa → revisão humana obrigatória; custo por geração registrado |
| App do garçom como PWA "modo equipe" do mesmo front | zero app nativo | médio | baixa | M11+ | — |
| Painel do dono no celular (faturamento ao vivo) | dono fora do restaurante | médio | baixa | M14 | — |
| Modo "cardápio digital somente leitura" (sem pedido) como plano de entrada SaaS | venda para restaurantes conservadores | médio | baixa | G | — |
| Integração iFood/delivery como `orders.source = delivery` | canal extra | alto | alta | G | homologação |

## Futuro
Reservas e fila de espera; fidelidade; CRM; multi-unidade consolidado (`organizations`); previsão de demanda para compras; integração contábil; NFC-e/SAT (depende de decisão jurídica — Q5); TEF integrado com maquininha; totem de autoatendimento reaproveitando aprendizados do QIOSK.

## Não recomendado (agora)
- **Servidor local no restaurante** como padrão: dobra manutenção; só se a operação provar necessidade (ADR-011).
- **Mutações offline no KDS/caixa**: fonte clássica de duplicidade e conflitos financeiros.
- **Login social para cliente**: atrito sem benefício.
- **Microserviços/Kubernetes/Redis** no estágio atual.
- **Firebase/Firestore** como banco: sem transações relacionais fortes e constraints para dinheiro (lição do QIOSK).
- **Preço ou total vindo do cliente** em qualquer circunstância.

## Observações de operação real que moldaram decisões
- Sexta-feira lotada = pico de 30–60 pedidos/hora em um restaurante médio; nada aqui exige escala, tudo exige **corretude e clareza**.
- Cozinha não lê letra pequena; observação é o campo mais importante do ticket.
- O caixa fecha à noite, cansado: fechamento deve ser automático e a divergência aparecer sozinha.
- Garçom transfere mesa e junta mesas o tempo todo; sistema que não faz isso vira papel.
- Clientes tiram foto do QR "para pedir depois" — por isso a confirmação de sessão.
