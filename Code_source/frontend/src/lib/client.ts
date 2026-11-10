const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
const TOKEN_KEY = 'jmp.token';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let token: string | null = localStorage.getItem(TOKEN_KEY);
let onUnauthorized: (() => void) | null = null;

export function setToken(value: string | null): void {
  token = value;
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

export function hasToken(): boolean {
  return token != null;
}

/** Le provider d'authentification enregistre son handler de déconnexion. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...authHeaders(),
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      if (body && (body.message || body.detail)) message = body.message ?? body.detail;
    } catch {
      /* corps non JSON */
    }
    if (res.status === 401 && !path.startsWith('/api/auth/login')) {
      setToken(null);
      onUnauthorized?.();
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, file: File, fields?: Record<string, string>) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields ?? {})) form.append(key, value);
    form.append('file', file);
    return request<T>(path, { method: 'POST', body: form });
  },
};

/** Les exports exigent l'en-tête Authorization : téléchargement via fetch puis blob. */
export async function downloadExport(format: 'excel' | 'pdf', date?: string, tripId?: number | string): Promise<void> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (tripId) params.set('tripId', String(tripId));
  const qs = params.toString();
  const q = qs ? `?${qs}` : '';
  const res = await fetch(`${BASE}/api/export/${format}${q}`, { headers: authHeaders() });
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      if (body && (body.message || body.detail)) message = body.message ?? body.detail;
    } catch {
      /* corps non JSON */
    }
    if (res.status === 401) {
      setToken(null);
      onUnauthorized?.();
    }
    throw new ApiError(res.status, message);
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const filename = /filename=([^;]+)/.exec(disposition)?.[1]?.replace(/"/g, '') ?? `plan-jmp.${format}`;
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
