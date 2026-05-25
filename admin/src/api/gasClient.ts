/**
 * GAS Web App への HTTP クライアント。
 * VITE_GAS_URL 環境変数が設定されていない場合は空文字を返す。
 *
 * GAS Web App は CORS のプリフライトを通すため、
 * POST は Content-Type: text/plain で送信し、GAS 側で JSON.parse する。
 */

const BASE = import.meta.env.VITE_GAS_URL as string;

export class GasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GasError';
  }
}

export async function gasGet<T>(
  action: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(BASE);
  url.searchParams.set('action', action);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString());
  const json = await res.json();
  if (!json.success) throw new GasError(json.error ?? 'GAS error');
  return json.data as T;
}

export async function gasPost<T>(
  action: string,
  body: object,
): Promise<T> {
  const url = new URL(BASE);
  url.searchParams.set('action', action);
  const res = await fetch(url.toString(), {
    method: 'POST',
    // text/plain でプリフライトなし (GAS 側で JSON.parse する)
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.success) throw new GasError(json.error ?? 'GAS error');
  return json.data as T;
}
