# Bella OS — Diretrizes de Frontend

> Cópia operacional do padrão de estética atual do Bella OS. O repositório precisa ser autossuficiente: Sonnet segue **este** arquivo. Aplica-se a `apps/web`. **Não** se aplica a PDFs (QR Codes, relatórios impressos), que têm layout próprio simples em papel.
>
> **Reescrito em 2026-09-11 (M21):** o Victor desenhou as telas num canvas do Claude Design (`bella-os-artboards.vsoareslins452.chatgpt.site`) e aprovou aquela direção visual — diferente da que estava documentada aqui antes. Os tokens abaixo foram extraídos do DOM real do mockup aprovado (`getComputedStyle`, não estimados visualmente), então este documento reflete o que o produto **é** agora, não uma reinterpretação.

## 1. Alvo estético
"Produto de restaurante premium, calmo e confiável" — não um app de delivery genérico, não um template gerado por IA. Referência direta: o próprio canvas aprovado do Claude Design (link acima). **Proibido:** emoji como ícone, shadcn cru sem customização, gradientes neon, glassmorphism, tom "🚀 Vamos lá!".

Teste final de toda tela: "parece o mockup que o Victor aprovou, ou parece outra coisa"? Comparar direto com o canvas antes de considerar uma tela pronta.

## 2. Fonte — uma família só
**Switzer** (Fontshare), pesos 400 (corpo) / 500–600 (títulos e ênfase), para TUDO — corpo e títulos. Não existe família de display separada nem fonte monoespaçada de marca; números tabulares (dinheiro, IDs) usam a pilha monoespaçada do sistema (`ui-monospace`), sem carregar webfont extra.

```html
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600&display=swap">
```
Verificar no console: `document.fonts.check('600 16px "Switzer"')` deve ser `true`. Títulos (`h1`–`h4`) usam `font-weight: 600` e `letter-spacing: -0.02em`, aplicado globalmente em `@layer base` — nunca precisa de uma classe `font-display` separada (essa classe não existe mais desde o M21; se aparecer em algum componente antigo, é resíduo a remover).

## 3. Cor — hex/rgb (não oklch), claro por padrão
```
--background: #f2f2f2;      --foreground: #252525;
--surface: #ffffff;         --elevated: #ffffff;
--card: var(--surface);     --card-warm: #faf7f3;
--muted-foreground: #686868;
--brand: #bd3027;           --brand-hover: #a52620;    --brand-foreground: #ffffff;
--brand-soft: rgb(189 48 39 / .1);
--border: #e8e8e8;          --border-strong: #dddddd;
--input: #e8e8e8;           --ring: rgb(189 48 39 / .4);
--radius: 7px;              --radius-lg: 13px;
--danger: #c0392b;          --success: #2f7d4f;
```
- `--brand` continua sendo o ponto de override **white-label** (`ARCHITECTURE.md` — Bella é tenant/configuração, nunca `if` no núcleo): só o valor default mudou para o vermelho acima, a variável em si segue sobrescrevível por tenant.
- Cards com raio `--radius-lg` (13px), sombra muito sutil `0 8px 24px rgba(0,0,0,.03)`, borda `1px solid var(--border-strong)`. `--card-warm` é a variante bege usada em blocos de destaque (ex.: aviso "você está na Mesa 08").
- Controles/botões usam `--radius` (7px), menor que o raio dos cards.
- Profundidade por camada sutil (fundo `#f2f2f2` < card branco) + borda, nunca sombra colorida.

### KDS — a ÚNICA superfície com tema escuro, e é um tema fixo, não alternável
```
.kds-theme {
  --background: #202020;      --foreground: #fffaf4;
  --surface: #2d2a28;         --elevated: #322f2c;
  --card: var(--surface);     --muted-foreground: #b8b0a8;
  --border: rgb(255 250 244 / .08);  --border-strong: rgb(255 250 244 / .14);
  --danger: #e05a4a;          --success: #4fae7a;
}
```
Aplicar via classe `.kds-theme` na raiz da tela do KDS. Cliente e admin **não** têm modo escuro — não estava no mockup aprovado, não é uma decisão a inventar por conta própria.

## 4. Forma, ícones, texto, movimento
Ícones **Lucide** stroke 1.5; labels de seção em caixa-alta `text-[11px] tracking-widest muted-foreground`; números financeiros com peso e tabulares (`.font-mono-tabular`, `font-variant-numeric: tabular-nums`, pilha `ui-monospace`); motion 150–300 ms; skeletons, não spinners gigantes; idioma pt-BR, tom direto.

## 5. Adaptações por superfície do Bella OS
| Superfície | Regras extras |
|-----------|---------------|
| **Cliente (mobile)** | uma mão, alvo de toque ≥ 44 px, CTA fixo no rodapé ("Ver carrinho · R$ 84,50"), fotos em proporção fixa com placeholder, texto legível a 16 px, sem hover-only, funciona em 360 px |
| **KDS** | tema escuro fixo (`.kds-theme`, §3), legível a 1,5 m: fonte de item ≥ 20 px, observações em destaque, cor de urgência por tempo (verde → âmbar → vermelho), botões enormes, sem scroll horizontal |
| **Admin/caixa** | tema claro, densidade alta, tabelas com números tabulares, atalhos de teclado no caixa, teclado numérico para PIN e valores, confirmações explícitas em ações financeiras |

## 6. Stack de UI
React + Tailwind v4 (tokens via `@theme inline`) + shadcn/ui como base fortemente customizada + TanStack Query + Lucide. Estado servidor via Query; carrinho via Zustand com `persist`. Sem `style={{}}` inline para layout (diferente do projeto QIOSK).

## 7. Estados obrigatórios em toda tela
Loading (skeleton), vazio (mensagem + ação), erro (mensagem humana + `request_id` discreto + tentar novamente), sucesso; em superfícies operacionais, banner de **sem conexão** com timestamp do último dado válido (padrão já implementado no KDS, M20 — reaproveitar o mesmo componente/lógica em outras telas real-time futuras).
