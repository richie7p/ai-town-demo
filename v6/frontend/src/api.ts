import type { Payload } from './types';

// 前端只呼叫自己的後端，不保存、不傳送任何 API Key。
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* 保留預設訊息 */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  state: () => request<Payload>('/api/state'),
  step: (count = 1) => post<Payload>('/api/step', { count }),
  reset: (seed?: number, mode?: 'rule' | 'llm') => post<Payload>('/api/reset', { seed, mode }),
  trigger: (type: string) => post<Payload>('/api/events/trigger', { type }),
  save: (name: string) => post<{ name: string; tick: number }>('/api/save', { name }),
  load: (name: string) => post<Payload>('/api/load', { name }),
  loadSnapshot: (snapshot: unknown) => post<Payload>('/api/load', { snapshot }),
  saves: () => request<{ name: string; saved_at: string }[]>('/api/saves'),
  perception: (rid: string) => request<Record<string, unknown>>(`/api/residents/${rid}/perception`),
  exportUrl: '/api/export',
};
