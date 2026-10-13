const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const TOKEN_KEY = 'kortex_support_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (value: string | null) =>
  value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Fired when the server rejects our token, so the app can bounce to login. */
export const onUnauthorized = { handler: null as null | (() => void) };

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail)) return data.detail[0]?.msg ?? `שגיאה ${res.status}`;
  } catch {
    /* body was not JSON */
  }
  if (res.status === 404) return 'הפריט המבוקש לא נמצא';
  if (res.status === 403) return 'אין לך הרשאה לפעולה זו';
  if (res.status >= 500) return 'שגיאת שרת. נסו שוב בעוד רגע.';
  return `שגיאה ${res.status}`;
}

interface Options extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { body, auth = true, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;                       // let the browser set the boundary
  } else if (body !== undefined) {
    requestHeaders.set('Content-Type', 'application/json');
    payload = JSON.stringify(body);
  }

  const token = auth ? getToken() : null;
  if (token) requestHeaders.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...rest, headers: requestHeaders, body: payload });
  } catch {
    throw new ApiError('אין חיבור לשרת. בדקו את החיבור לרשת.', 0);
  }

  // Only a request that carried a token can have an expired session. Without
  // one -- a sign-in with a wrong password -- the server's own message is the
  // right one to show.
  if (res.status === 401 && token) {
    setToken(null);
    onUnauthorized.handler?.();
    throw new ApiError('פג תוקף ההתחברות. התחברו מחדש.', 401);
  }
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  if (res.status === 204) return undefined as T;

  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return (await res.text()) as unknown as T;
  return res.json() as Promise<T>;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body });
export const patch = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body });
export const put = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

/** Guest endpoints carry no Authorization header. */
export const guest = {
  get: <T>(path: string) => api<T>(path, { auth: false }),
  patch: <T>(path: string, body?: unknown) =>
    api<T>(path, { method: 'PATCH', body, auth: false }),
  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api<T>(path, { method: 'POST', body: form, auth: false });
  },
};

export function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  return api<T>(path, { method: 'POST', body: form });
}

export function downloadUrl(kind: 'ticket' | 'subtask', id: number): string {
  return `${BASE}/attachments/${kind}/${id}`;
}

/** An object URL for showing a photograph or playing a recording in place.
 *
 *  An <img>/<video>/<audio> src cannot carry an Authorization header, and
 *  putting a token in the URL would leak it into logs and history, so the
 *  bytes are fetched with the header and handed to the element as a blob.
 *  The caller owns the URL and must revoke it. */
export async function attachmentObjectUrl(
  kind: 'ticket' | 'subtask', id: number,
): Promise<string> {
  const token = getToken();
  const res = await fetch(`${downloadUrl(kind, id)}?inline=true`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  return URL.createObjectURL(await res.blob());
}

/** Attachment downloads need the auth header, so fetch as a blob then save. */
export async function downloadAttachment(
  kind: 'ticket' | 'subtask', id: number, filename: string,
): Promise<void> {
  const token = getToken();
  const res = await fetch(downloadUrl(kind, id), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
