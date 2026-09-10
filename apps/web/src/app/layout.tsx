import type { Metadata } from 'next';
import './globals.css';

/**
 * Fonte do Bella OS (docs/FRONTEND_GUIDELINES.md, M21 — handoff do Claude Design):
 * uma família só, Switzer, pra tudo (corpo e títulos). Schibsted Grotesk e JetBrains
 * Mono foram removidas — não fazem parte da direção visual aprovada pelo Victor.
 * Switzer é da Fontshare, que não é uma origem suportada por `next/font` (só Google +
 * arquivos locais), carregada via <link> no <head>.
 */
export const metadata: Metadata = {
  title: 'Bella OS',
  description: 'Sistema operacional de restaurante — Bella III, Franco da Rocha/SP.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
