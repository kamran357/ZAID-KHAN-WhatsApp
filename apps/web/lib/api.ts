export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'error',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Shown whenever the browser got a proxied/HTML response instead of our API. */
export const API_UNREACHABLE =
  'API server is not reachable. On Vercel set API_PROXY_TARGET to your API URL (Settings → Environment Variables) and redeploy.';

export function isApiUnreachable(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'api_unreachable';
}

function looksLikeHtml(body: string): boolean {
  return /^\s*</.test(body);
}

/**
 * Turns any response into JSON or a typed error. A proxy/hosting layer can answer
 * with an HTML error page ("The page could not be found"), which must never surface
 * as `Unexpected token '<'` — that hides the real problem.
 */
export async function parseResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  const trimmed = raw.trim();

  let payload: unknown = null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      payload = JSON.parse(trimmed);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const apiError = payload as { error?: { message?: string; code?: string } } | null;

    if (response.status === 401) {
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
      throw new ApiError(401, apiError?.error?.message ?? 'Sign in to continue', 'unauthorized');
    }

    if (apiError?.error?.message) {
      throw new ApiError(response.status, apiError.error.message, apiError.error.code ?? 'error');
    }

    if (looksLikeHtml(raw) || [404, 502, 503, 504].includes(response.status)) {
      throw new ApiError(
        response.status,
        `${API_UNREACHABLE} (HTTP ${response.status} from the proxy)`,
        'api_unreachable',
      );
    }

    throw new ApiError(response.status, `Request failed (${response.status})`, 'error');
  }

  if (!trimmed) return null as T;

  if (payload === null) {
    throw new ApiError(
      response.status,
      'The API returned a non-JSON response. Check API_PROXY_TARGET.',
      'bad_response',
    );
  }

  return payload as T;
}

async function request(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init);
  } catch {
    // Network/DNS/proxy failure — fetch rejects before any status exists.
    throw new ApiError(0, API_UNREACHABLE, 'api_unreachable');
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await request(path, {
    credentials: 'same-origin',
    signal,
    cache: 'no-store',
  });
  return parseResponse<T>(response);
}

export async function apiSend<T>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const response = await request(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse<T>(response);
}
