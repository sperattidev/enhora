import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, onSessionExpired, refreshSession, setAccessToken } from './api';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('api client', () => {
  beforeEach(() => setAccessToken(null));

  it('sends the access token and cookies', async () => {
    setAccessToken('tok-1');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, { ok: true }));
    await api('/jobs');
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.credentials).toBe('include');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    setAccessToken('old');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(200, { accessToken: 'new' }))
      .mockResolvedValueOnce(json(200, { items: [] }));
    await expect(api('/jobs')).resolves.toEqual({ items: [] });
    expect(fetchMock.mock.calls[1]![0]).toBe('/auth/refresh');
    expect((fetchMock.mock.calls[2]![1]?.headers as Record<string, string>).Authorization).toBe('Bearer new');
  });

  it('shares one refresh between concurrent callers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(200, { accessToken: 't' }));
    await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('announces an expired session when the refresh fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(401, {}));
    const expired = vi.fn();
    const off = onSessionExpired(expired);
    await expect(api('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledOnce();
    off();
  });

  it('does not refresh on public endpoints', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json(401, { message: 'Email o contraseña incorrectos' }));
    await expect(api('/auth/login', { method: 'POST', body: {}, auth: false })).rejects.toThrow(
      'Email o contraseña incorrectos',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('exposes validation issues', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(400, { message: 'Datos inválidos', issues: [{ path: 'cuit', message: 'CUIT inválido' }] }),
    );
    const error = await api('/auth/register/merchant', { method: 'POST', body: {}, auth: false }).catch((e) => e);
    expect((error as ApiError).issues).toEqual([{ path: 'cuit', message: 'CUIT inválido' }]);
  });

  it('returns undefined for 204', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api('/auth/logout', { method: 'POST', auth: false })).resolves.toBeUndefined();
  });
});
