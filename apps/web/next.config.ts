import type { NextConfig } from 'next';

// `apps/api` roda como um serviço à parte (origem diferente em qualquer ambiente —
// localhost:3001 em dev, subdomínio Railway separado em produção). Proxiar por aqui
// faz o navegador falar só com a própria origem do `web`; o cookie de sessão do Better
// Auth vira first-party (nunca cross-site), o que evita bloqueio de cookie de terceiro
// (Safari ITP, ou qualquer navegador que trate os dois subdomínios `*.up.railway.app`
// como sites diferentes — achado real testando login em produção, primeiro no Chrome
// desktop via SameSite=None, depois confirmado quebrando de novo no celular: a correção
// de verdade é nunca depender de cookie cross-site, não caçar exceção por navegador).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/v1/:path*', destination: `${API_URL}/v1/:path*` },
      { source: '/api/auth/:path*', destination: `${API_URL}/api/auth/:path*` },
    ];
  },
};

export default nextConfig;
