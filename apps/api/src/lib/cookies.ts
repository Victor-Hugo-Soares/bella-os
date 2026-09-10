/**
 * Cookie mínimo, sem dependência nova (`@fastify/cookie` não foi adicionado — regra 12:
 * pesquisar antes de adicionar biblioteca; aqui não precisa: a segurança do cookie de
 * sessão de mesa (M6) vem do valor ser opaco + verificado por hash no banco, o mesmo
 * modelo de confiança do token de dispositivo (M3) — não precisamos de um cookie
 * ASSINADO por HMAC, então parsear/montar o header à mão é suficiente e mais simples
 * que integrar uma lib só para isso).
 */

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) result[name] = decodeURIComponent(value);
  }
  return result;
}

export interface SetCookieOptions {
  maxAgeSeconds: number;
  secure: boolean;
}

/** Sempre `HttpOnly` + `SameSite=Lax` + `Path=/` — nunca acessível a JS no browser. */
export function buildSetCookie(name: string, value: string, options: SetCookieOptions): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${options.maxAgeSeconds}`,
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}
