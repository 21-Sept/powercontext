export interface DocItem {
  id?: string
  text: string
  metadata?: Record<string, unknown>
}

export interface ImportResult {
  added: number
  ids: string[]
  addMs: number
  refreshMs: number
  docCount: number
}

export interface SearchHit {
  id: string
  text: string | null
  metadata: Record<string, unknown> | null
  distance: number | null
}

export interface SearchResult {
  results: SearchHit[]
  tookMs: number
  mode: 'hybrid' | 'vector' | 'fulltext'
}

export interface SessionInfo {
  database: string
  collection: string
  engineVersion: string | null
  startedAt: string | null
  initMs: number | null
  lastImport: { added: number; addMs: number; refreshMs: number; at: string } | null
  lastSearch: { mode: string; tookMs: number; at: string } | null
}

export interface HealthInfo extends SessionInfo {
  ok: boolean
  docCount: number
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  return (await res.json()) as T
}

export const api = {
  health: () => request<HealthInfo>('/api/health'),
  session: () => request<SessionInfo>('/api/session'),
  docs: () => request<{ count: number }>('/api/docs'),
  import: (documents: DocItem[], embeddings: number[][]) =>
    request<ImportResult>('/api/import', {
      method: 'POST',
      body: JSON.stringify({ documents, embeddings }),
    }),
  search: (embedding: number[] | null, contains: string, topk = 10, mode: 'hybrid' | 'vector' | 'fulltext' = 'hybrid') =>
    request<SearchResult>('/api/search', {
      method: 'POST',
      body: JSON.stringify({ embedding, contains, topk, mode }),
    }),
  deleteDoc: (id: string) => request<{ deleted: number }>(`/api/docs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  reset: () => request<{ reset: boolean }>('/api/reset', { method: 'POST' }),
}
