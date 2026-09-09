# Bella OS — Diretrizes de Frontend

> Cópia operacional do padrão de estética do Victor (validado em projeto anterior) adaptada ao Bella OS. O repositório precisa ser autossuficiente: Sonnet segue **este** arquivo. Aplica-se a `apps/web`. **Não** se aplica a PDFs (QR Codes, relatórios impressos), que têm layout próprio simples em papel.

## 1. Alvo estético
"Produto SaaS premium feito por estúdio" (referências: Linear, Vercel, Raycast, Claude desktop). Calmo, denso na medida, profissional. **Proibido:** Inter/Geist como display, roxo/violeta genérico, emoji como ícone, shadcn cru, gradientes neon, glassmorphism, tom "🚀 Vamos lá!".

Teste final de toda tela: "parece um produto que uma empresa séria pagaria caro, ou parece template de IA?" Tem que ser o primeiro.

## 2. Fontes (duas origens)
- Display/títulos: **Schibsted Grotesk** 400–700 (Google Fonts). `letter-spacing: -0.025em`.
- Corpo/UI: **Switzer** 400–600 (Fontshare).
- Mono (IDs, valores, códigos de mesa): **JetBrains Mono** 400–500 (Google Fonts).

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600&display=swap">
```
Verificar no console: `document.fonts.check('600 16px "Schibsted Grotesk"')` deve ser `true` para as três famílias. Gotcha Tailwind v4: sob `@theme inline`, `var(--font-display)` em `@layer base` resolve vazio → usar o stack literal ou as classes `font-display`/`font-sans`/`font-mono`.

## 3. Cor (oklch, dark por padrão, `.light` disponível)
```
--background: oklch(16.5% .005 220);   --foreground: oklch(94% .005 220);
--surface: oklch(20.5% .006 220);      --elevated: oklch(23.5% .007 220);
--card: var(--surface);                --muted-foreground: oklch(66% .012 220);
--brand: oklch(74% .11 184);           --brand-foreground: oklch(15% .01 200);
--brand-soft: oklch(74% .11 184/.1);
--border: oklch(100% 0 0/.06);         --border-strong: oklch(100% 0 0/.12);
--input: oklch(100% 0 0/.08);          --ring: oklch(74% .11 184/.5);
--radius: .625rem;
```
Light: fundo `oklch(98.5% .003 80)`, foreground `oklch(18% .01 220)`, brand `oklch(62% .1 184)`.
- `--brand` é **white-label**: no Bella OS vem de `tenant_settings.brand` (injetado no `<html style>` por tenant). Usar com parcimônia (botão primário, foco, ativo, marca).
- Profundidade por camadas (background < surface < elevated) + borda sutil, não sombras coloridas.
- Semânticas (status de ticket, formas de pagamento, categorias): âmbar `oklch(78% .16 75)`, teal `oklch(80% .13 180)`, verde `oklch(74% .18 145)`, azul `oklch(65% .18 250)`, laranja `oklch(72% .18 50)`, roxo `oklch(66% .22 305)`, rosa `oklch(70% .22 350)`. Fundos suaves via `color-mix(in oklch, var(--x) 14%, transparent)`. Nunca concatenar alpha em hex.

## 4. Forma, ícones, texto, movimento
Raio ~10px consistente; ícones **Lucide** stroke 1.5; labels de seção em caixa-alta `text-[11px] tracking-widest muted-foreground`; números financeiros com peso e tabulares (`font-variant-numeric: tabular-nums`); motion 150–300 ms; skeletons, não spinners gigantes; idioma pt-BR, tom direto.

## 5. Adaptações por superfície do Bella OS
| Superfície | Regras extras |
|-----------|---------------|
| **Cliente (mobile)** | uma mão, alvo de toque ≥ 44 px, CTA fixo no rodapé ("Ver carrinho · R$ 84,50"), fotos em proporção fixa com placeholder, texto legível a 16 px, sem hover-only, funciona em 360 px |
| **KDS** | legível a 1,5 m: fonte de item ≥ 20 px, observações em destaque, cor de urgência por tempo (verde → âmbar → vermelho), botões enormes, sem scroll horizontal, tema pode ser claro de alto contraste se a inspeção em tela real provar melhor (ADR-014) |
| **Admin/caixa** | densidade alta, tabelas com números tabulares, atalhos de teclado no caixa, teclado numérico para PIN e valores, confirmações explícitas em ações financeiras |

## 6. Stack de UI
React + Tailwind v4 (tokens via `@theme inline`) + shadcn/ui como base fortemente customizada + TanStack Query + Lucide. Estado servidor via Query; carrinho via Zustand com `persist`. Sem `style={{}}` inline para layout (diferente do projeto QIOSK).

## 7. Estados obrigatórios em toda tela
Loading (skeleton), vazio (mensagem + ação), erro (mensagem humana + `request_id` discreto + tentar novamente), sucesso; em superfícies operacionais, banner de **sem conexão** com timestamp do último dado válido.
