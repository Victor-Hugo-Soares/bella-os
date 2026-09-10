/**
 * Cliente HTTP mínimo para a API do Bella OS (M4). `credentials: 'include'` é
 * obrigatório em todo request — a sessão do Better Auth (M2) é um cookie no domínio
 * da API, e API e web rodam em origens diferentes em desenvolvimento (`localhost:3000`
 * vs `localhost:3001`); sem isso o navegador não envia nem aceita o cookie. A API já
 * está configurada para aceitar essa origem via `WEB_ORIGIN` + `credentials: true`
 * (ADR do M2) — este arquivo é o lado do browser dessa mesma decisão.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface ApiErrorBody {
  error: { code: string; message: string; request_id: string };
}

export class ApiError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly status: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error.code;
    this.requestId = body.error.request_id;
  }
}

const GET_RETRY_ATTEMPTS = 2;
const GET_RETRY_BASE_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry com backoff SÓ para falha de rede (o `fetch` lançou — sem resposta nenhuma do
 * servidor), nunca para uma resposta HTTP de erro (4xx/5xx são respostas legítimas do
 * servidor, não "a rede caiu"), e SÓ para `GET` (idempotente por natureza — `POST`/
 * `PATCH` já têm seu próprio mecanismo de segurança, `Idempotency-Key`, decidir retry
 * automático neles é uma escolha maior, fora do escopo de resiliência de rede do M20).
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const attempts = method === 'GET' ? GET_RETRY_ATTEMPTS : 0;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= attempts; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastErr = err;
      if (attempt === attempts) break;
      await sleep(GET_RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }
  throw lastErr;
}

/** Rotas próprias da API (`/v1/*`), que usam nosso envelope de erro padronizado. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchWithRetry(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init.headers },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    if (body?.error) throw new ApiError(res.status, body);
    throw new Error(`Falha na requisição (${res.status}).`);
  }

  return (await res.json()) as T;
}

/**
 * Rotas de autenticação (`/api/auth/*`), atendidas diretamente pelo Better Auth — não
 * passam pelo nosso `AppError`/envelope de erro (ver identity/routes.ts no backend), o
 * formato de erro é o próprio do Better Auth. Extrai uma mensagem de forma tolerante,
 * cobrindo as duas formas possíveis (a nossa, `{ error: { message } }` — ex.: um 404 de
 * rota que nem chegou ao Better Auth; e a do Better Auth, `{ message }` direto —
 * confirmado testando de verdade num browser real: sem `WEB_ORIGIN` configurado, a
 * requisição nem chega à rota do Better Auth e cai no nosso 404 primeiro), sem assumir
 * uma forma exata. Nunca lança — quem chama decide o que fazer.
 */
export async function authFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      extractErrorMessage(body) ?? 'Não foi possível concluir. Confira os dados e tente novamente.';
    return { ok: false, message };
  }
  return { ok: true, data: body as T };
}

function extractErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  if ('message' in body && typeof body.message === 'string') return body.message;
  if ('error' in body && body.error && typeof body.error === 'object' && 'message' in body.error) {
    const nested = (body.error as { message?: unknown }).message;
    if (typeof nested === 'string') return nested;
  }
  return null;
}
