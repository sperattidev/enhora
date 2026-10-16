const BASE = import.meta.env.VITE_API_URL ?? '';

export interface ApiIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get issues(): ApiIssue[] {
    return Array.isArray(this.body.issues) ? (this.body.issues as ApiIssue[]) : [];
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
const expiredListeners = new Set<() => void>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Called when the session cannot be renewed, so the UI can send the user to the login page. */
export function onSessionExpired(listener: () => void): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}

/**
 * Renews the access token with the HttpOnly refresh cookie. Concurrent callers share one request,
 * because the API rotates the refresh token and a second parallel refresh would look like theft.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        accessToken = null;
        return false;
      }
      accessToken = ((await res.json()) as { accessToken: string }).accessToken;
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Public endpoints skip the Authorization header and the refresh-and-retry dance. */
  auth?: boolean;
  signal?: AbortSignal;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { auth = true } = opts;
  const send = () =>
    fetch(`${BASE}${path}`, {
      method: opts.method ?? 'GET',
      credentials: 'include',
      signal: opts.signal,
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

  let res = await send();
  if (res.status === 401 && auth) {
    if (await refreshSession()) {
      res = await send();
    } else {
      expiredListeners.forEach((l) => l());
    }
  }
  if (res.status === 204) return undefined as T;

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof data.message === 'string' ? data.message : 'Algo salió mal. Probá de nuevo.';
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}
