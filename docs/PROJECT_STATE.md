# Bella OS — Estado do Projeto

> Fotografia atual. Atualizar ao fim de cada milestone e antes de compactar contexto. Histórico vai para `memory/archive/`.

**Atualizado em:** 2026-09-09 (M5 concluído e mergeado, sessão Sonnet 5)
**Fase:** B — Catálogo e operação básica · **Milestone concluído:** M5 Catálogo (API + admin) · **Próximo:** M6 Mesas, QR e sessão de mesa (`ACTIVE_PLAN.md`)
**Branch:** `main` · **Remote:** `https://github.com/Victor-Hugo-Soares/bella-os.git` · **Commit:** `0919719` (merge PR #7, M5)
**CI:** verde nos 3 jobs (lint·format·typecheck·unit, integração Postgres — **53/53 testes** em 8 arquivos, build+smoke).

## 1. Estado funcional do produto
Além de login/permissão/dispositivo (M1–M3) e do shell web (M4/M4.1), agora existe um cardápio de verdade: um dono/gerente autenticado cria estações de produção (cozinha, bar, ...), categorias e produtos com preço, e pode esgotar/repor um produto com um clique. Ainda não existe cardápio visível ao cliente (isso é M7) nem mesa/QR (M6).

## 2. Estado por módulo
| Módulo | Estado | Observação |
|--------|--------|------------|
| identity (login, sessão, permissão, dispositivo, PIN) | **funcional (M1–M3)** | — |
| `apps/web` (shell, login, design system) | **funcional (M4/M4.1)** | — |
| **catálogo** (estações, categorias, produtos) | **funcional (M5)**, CRUD completo + admin UI | — |
| catálogo (grupos de modificador, modificadores) | **API pronta, sem UI** (M5, escopo cortado) | UI entra quando M6/M7 justificarem |
| catálogo (imagem de produto, meio a meio) | não iniciado | reservado, não modelado ainda |
| mesas / sessão de mesa / QR | não iniciado | M6 |
| cardápio do cliente / carrinho | não iniciado | M7 |
| pedidos / KDS / caixa | não iniciado | Fase C/D |

## 3. Ambiente conhecido
Sem mudança (Docker local com falha, ENV-1; workspace OneDrive, ENV-5). **ENV-6** seguiu acontecendo: a conta ativa do `gh` voltou sozinha para `victorlins-dev` mais uma vez nesta sessão (5ª ocorrência), pega antes do push como sempre — considerar isso um padrão estrutural do ambiente, não um incidente pontual.

## 4. Evidências do M5 (resumo; detalhes em `QA_LEDGER.md`, decisão em `DECISIONS.md` ADR-030)
- Schema novo (`stations`, `categories`, `products`, `modifier_groups`, `modifiers`, `product_modifier_groups`), todas com RLS por tenant igual a qualquer outra tabela de negócio — sem exceção.
- **Achado real de arquitetura:** `GET /v1/me/tenants` (o front precisa saber a qual tenant o usuário pertence antes de ter `X-Tenant-Id`) esbarrou em `memberships` ter RLS por tenant — resolvido com uma segunda policy de RLS permissiva por `user_id` (`selfLookupPolicy`), combinada com OR pela regra padrão do Postgres, não um bypass.
- **53/53 testes de integração verdes** (45 de M1–M3 + 8 novos do catálogo) cobrindo fluxo feliz, validação cruzada de tenant, soft-delete, permissão negativa (`kitchen`), isolamento entre tenants, vínculo produto↔modificador, `GET /v1/me/tenants`.
- Admin UI (`/admin/catalog/{stations,categories,products}`) com os 4 estados obrigatórios; testado ao vivo no estado de erro (sem Postgres local para testar o fluxo de sucesso — limitação registrada, não escondida).
- **Escopo cortado conscientemente:** sem imagem de produto (upload/storage é problema à parte) e sem meio a meio (depende de decisão de produto sobre precificação).

## 5. Decisões que não podem ser esquecidas
**ADR-025** (`devices`/`pairing_codes` sem RLS). **ADR-026** (`@node-rs/argon2`). **ADR-027** (consultas de teste via dono precisam filtrar `tenant_id`). **ADR-028** (M4: typegen, fontes, `authFetch`, `next start` não pega rebuild). **ADR-029** (M4.1: redesenho por feedback "cara de IA"). **ADR-030** (M5: `selfLookupPolicy` para `GET /v1/me/tenants` sem enfraquecer isolamento).

## 6. Perguntas abertas para o Victor
Sem mudança — ver `PRODUCT_CONTEXT.md §2`. Nova observação de produto (não bloqueante): ainda não existe seletor de tenant na UI — hoje o front assume o primeiro tenant do usuário, o que já é suficiente para o Bella III sozinho.

## 7. Dependendo do Victor / pendências operacionais
- Reiniciar a máquina para tentar destravar o Docker Desktop (destravaria testar o fluxo completo de catálogo na UI localmente).
- Decidir se torna o repositório privado (ainda pendente desde o bootstrap).

## 8. Próximo passo exato
Executar o **M6** conforme `docs/ACTIVE_PLAN.md`: mesas, áreas, `qr_code`, sessão de mesa (`table_sessions`) com índice único parcial (só uma sessão aberta por mesa), geração de PDF dos QR Codes.
