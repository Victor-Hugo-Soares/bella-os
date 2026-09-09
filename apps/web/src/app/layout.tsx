import type { Metadata } from 'next';
import { JetBrains_Mono, Schibsted_Grotesk } from 'next/font/google';
import './globals.css';

/**
 * Fontes do Bella OS (docs/FRONTEND_GUIDELINES.md). Schibsted Grotesk e JetBrains Mono
 * são auto-hospedadas pelo Next (`next/font/google` baixa e serve localmente — sem
 * requisição externa, sem layout shift). Switzer é da Fontshare, que não é uma origem
 * suportada por `next/font` (só Google + arquivos locais); carregada via <link> no
 * <head>, como o próprio guideline já previa para fora do Google Fonts.
 */
const schibstedGrotesk = Schibsted_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Bella OS',
  description: 'Sistema operacional de restaurante — Bella III, Franco da Rocha/SP.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className={`${schibstedGrotesk.variable} ${jetbrainsMono.variable}`}>
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
