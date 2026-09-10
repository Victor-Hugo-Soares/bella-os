# Bella OS — Plano Ativo

> Plano do milestone em execução. Sonnet: leia `CLAUDE.md` → `PROJECT_STATE.md` → este arquivo → `docs/FRONTEND_GUIDELINES.md` §5 (cliente/mobile) → `DOMAIN_MODEL.md` §1.3/§1.4/§2 antes de tocar em código. Ao concluir, registre evidências em `QA_LEDGER.md`, atualize `PROJECT_STATE.md` e reescreva este arquivo para o próximo milestone (`ROADMAP.md`).

> M6 (mesas, QR, sessão de mesa) está mergeado em `main` (commit `e323755`, PR #9, CI verde: 60/60 testes). Este plano do M7 assume isso como ponto de partida — **último milestone da Fase B**.

## Milestone atual: **M7 — Cardápio do cliente + carrinho** (fim da Fase B)

### Problema
Catálogo (M5) e sessão de mesa (M6) existem, mas nenhum cliente físico consegue ver um cardápio ainda — tudo que existe hoje exige login de staff (`catalog.manage`). M7 é a primeira tela pública de verdade: um cliente escaneia o QR, vê o cardápio do restaurante (só o que está ativo e disponível), monta um carrinho. **Não envia pedido ainda** (isso é M8) — o gate da Fase B (`ROADMAP.md`) é "monta pedido válido, sem enviar".

### Escopo desta fatia (decisões registradas)
- **SSE/realtime (`catalog.updated` ao vivo) fica FORA deste milestone.** O `ROADMAP.md` menciona isso no gate do M7, mas a infraestrutura de tempo real (outbox `domain_events` + `/v1/stream`) é do M9 (Fase C) e ainda não existe — construir SSE agora seria antecipar um milestone inteiro só para uma tela. Substituto do M7: o cardápio é buscado a cada visita/recarregamento da página; indisponibilidade é respeitada no momento da consulta e, de novo, no momento do pedido (M8, validação server-side). Reavaliar ao vivo quando M9 existir.
- **Sem modificadores na tela do cliente.** M5 já deixou a API pronta (`modifier_groups`/`modifiers`/vínculo) mas sem UI nem no admin; adicionar ao carrinho do cliente exigiria construir essa UI dos dois lados ao mesmo tempo. Produtos `kind=simple` sem modificador já são um cardápio navegável real; modificadores entram quando o admin também tiver a tela (pode ser um M7.1, como o M4.1 do design).
- **Carrinho é só client-side (localStorage), não server.** Nenhum pedido é criado neste milestone — o carrinho é estado de UI. `Idempotency-Key` é gerada ao montar o carrinho (antes de qualquer envio) e persistida junto, exatamente como `DOMAIN_MODEL.md §5` prescreve para o M8 consumir depois.

### Resultado esperado
1. **Rota pública de leitura do catálogo** (`GET /public/:tenantSlug/catalog`): devolve categorias ativas + produtos ativos E disponíveis (nunca os desativados/esgotados) + estações (só o necessário para agrupar, não expõe nada administrativo). Sem sessão de staff, sem `catalog.manage` — mas só leitura, nunca mutação.
2. **Página do cliente** (`apps/web/src/app/(customer)/[tenant]/m/[table]/page.tsx`, já reservada desde o M4): ao carregar, abre/entra na sessão de mesa (M6, `POST /public/.../session`, guarda o cookie automaticamente) e busca o catálogo público; renderiza categorias com scroll e produtos com preço formatado.
3. **Carrinho** (Zustand + `persist` em localStorage, conforme `FRONTEND_GUIDELINES.md §6`): adicionar/remover item, contador, total calculado no cliente **só para exibição** (o servidor recalcula tudo no M8 — nunca confiar no total do carrinho como fonte de verdade, `DOMAIN_MODEL.md §3`). CTA fixo no rodapé ("Ver carrinho · R$ X,XX") conforme `FRONTEND_GUIDELINES.md §5`.
4. **Mobile-first de verdade**: alvo de toque ≥ 44px, funciona em 360px, sem hover-only, texto legível a 16px — testado em viewport real, não só CSS lido.
5. **Estados obrigatórios**: loading (skeleton), vazio (cardápio sem itens — mensagem, não tela em branco), erro (mesa/tenant não encontrado — mensagem humana), sucesso.

### Arquivos envolvidos
- `apps/api/src/modules/catalog/public-routes.ts` (novo): `GET /public/:tenantSlug/catalog`.
- `apps/api/src/app.ts`: registrar a nova rota pública.
- `apps/web/src/app/(customer)/[tenant]/m/[table]/page.tsx`: substitui o placeholder do M4.
- `apps/web/src/lib/cart.ts` (novo): store Zustand com `persist`, `Idempotency-Key` gerada uma vez por carrinho.
- `apps/web/src/components/customer/**`: cartão de produto, lista de categorias, CTA de carrinho.
- Testes: `apps/api/test/integration/public-catalog.test.ts` (produto inativo/indisponível nunca aparece; isolamento entre tenants).

### Riscos
- **Confundir "não expõe dado administrativo" com "não precisa validar nada".** A rota pública ainda roda dentro de `withTenant()` normalmente (tenant resolvido pelo slug, igual ao M6) — não é um caso de exceção de RLS como `devices`/`guests`, é uma leitura filtrada dentro do tenant certo.
- **Zustand é dependência nova** — confirmar versão atual via npm antes de instalar (regra 12), mesmo já estando no `FRONTEND_GUIDELINES.md §6` como decisão de stack.
- **Total exibido no carrinho divergir do total real do pedido** (frete/taxa de serviço/couvert entram só no M12) — a tela precisa deixar claro que é uma prévia, não a conta final.

### Testes (2 frentes — mudança normal; não é dinheiro/pagamento real ainda, é leitura + estado de UI)
1. Integração (Postgres real, CI): produto inativo/indisponível nunca aparece na rota pública; produto de outro tenant nunca aparece; categoria vazia não quebra a resposta.
2. E2E manual real (browser): abrir a página do cliente com um tenant/mesa reais (via seed), ver categorias/produtos carregarem, adicionar ao carrinho, contador atualizar, testar em 2-3 larguras.

### Critérios de aceite
- [ ] Cardápio público mostra só o que está ativo e disponível; nunca vaza dado de outro tenant.
- [ ] Carrinho persiste no localStorage entre recarregamentos da página.
- [ ] Visual mobile-first testado em pelo menos 2 larguras reais.
- [ ] `pnpm check`/`pnpm build` verdes; CI remota verde.
- [ ] Docs atualizados; `ACTIVE_PLAN.md` reescrito para o início da Fase C (M8, criação idempotente de pedido — primeiro milestone com 3 frentes obrigatórias por ser crítico).

### Gate de Plano (a responder no início da execução do M7)
Problema entendido (primeira tela pública real, mas não envia pedido) · solução menor não existiria (precisa da leitura pública do catálogo + carrinho local) · risco principal é escopo (SSE e modificadores conscientemente fora, registrado) · prova por integração real (produto indisponível nunca vaza) + E2E manual · rollback trivial (rota nova, sem mutação) · multi-tenant preservado (leitura dentro de `withTenant()`, tenant resolvido por slug como no M6).

## Próximos milestones (resumo; detalhes em `ROADMAP.md`)
**Fim da Fase B** com o M7. Fase C: **M8 — criação idempotente de pedido** (primeiro milestone crítico da fase, 3 frentes obrigatórias: dinheiro/comanda) → M9 KDS em tempo real (aqui entra a infraestrutura de SSE cortada do M7) → M10 acompanhamento/expedição → M11 cancelamentos/pedido pela equipe.
