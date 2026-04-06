const GAS_URL = import.meta.env.VITE_GAS_URL as string;

class GasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GasError';
  }
}

export async function gasGet<T>(
  action: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(GAS_URL);
  url.searchParams.set('action', action);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res  = await fetch(url.toString(), { cache: 'no-store', redirect: 'follow' });
  const json = await res.json() as { success: boolean; data: T; error?: string };
  if (!json.success) throw new GasError(json.error ?? 'GAS error');
  return json.data;
}

export async function gasPost<T>(
  action: string,
  body: object,
): Promise<T> {
  const url = new URL(GAS_URL);
  url.searchParams.set('action', action);
  const res  = await fetch(url.toString(), {
    method:  'POST',
    // Content-Type を text/plain にして CORS preflight を回避する (GAS 側で JSON.parse)
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body:    JSON.stringify(body),
  });
  const json = await res.json() as { success: boolean; data: T; error?: string };
  if (!json.success) throw new GasError(json.error ?? 'GAS error');
  return json.data;
}
