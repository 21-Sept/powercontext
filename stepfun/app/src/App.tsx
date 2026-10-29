import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type HealthInfo, type SearchHit } from './lib/api'
import {
  loadEmbedder,
  reloadEmbedder,
  embedQuery,
  embed,
  type BackendInfo,
  type BackendKind,
} from './lib/embedder'
import {
  EVAL_DOCS,
  runQualityEval,
  runLatencyBench,
  runIncrementalCheck,
  type QualityReport,
  type LatencyReport,
  type IncrementalReport,
  type SearchMode,
} from './lib/bench'
import './App.css'

const SAMPLE_DOCS = [
  'seekdb 是 OceanBase 团队打造的 AI 原生数据库，内置向量索引与全文索引，一条 SQL 即可完成混合检索。',
  '阶跃星辰与 OceanBase 联合举办 AI 原生数据库竞赛，考察向量检索、混合检索与浏览器端推理能力。',
  '本应用在浏览器本地用 Transformers.js 对文档和查询做向量化，推理后端优先 WebGPU，不可用时自动回退 WASM。',
  '文档向量写入 seekdb 的 HNSW 索引，全文通过 IK 分词器建立倒排索引，两者由数据库统一管理。',
  '混合检索在数据库内部用 RRF（倒数排名融合）合并全文与向量两路结果，无需客户端二次融合。',
  '新增文档写入后调用索引刷新（refresh_index），刷新完成后新文档立即可被检索到。',
  '模型使用 INT8 / FP16 量化，FP16 体积压缩到 50%，INT8 压缩到 25%，检索质量损失可忽略。',
  '量化前后检索质量用 Recall@K 与 nDCG@K 衡量，实测指标记录在性能评测页。',
  '性能指标全部取中位数：模型加载、文档向量化、写入与刷新、查询向量化、检索延迟与端到端延迟。',
  '所有向量化均在浏览器端完成，用户文档不出本机；服务端只负责存储与检索，隐私安全。',
]

type Tab = 'search' | 'import' | 'bench' | 'state'

export default function App() {
  const [tab, setTab] = useState<Tab>('search')
  const [backend, setBackend] = useState<BackendInfo | null>(null)
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [booting, setBooting] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)

  const refreshHealth = useCallback(async () => {
    try {
      setHealth(await api.health())
    } catch (e) {
      console.warn('[app] health check failed:', e)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    // ?backend=wasm / ?backend=webgpu forces the boot backend — useful for
    // verifying the WASM path on machines where WebGPU exists.
    const forced = new URLSearchParams(location.search).get('backend')
    const preferred: BackendKind = forced === 'wasm' || forced === 'webgpu' ? forced : 'webgpu'
    ;(async () => {
      refreshHealth()
      try {
        const info = await loadEmbedder(preferred)
        if (!cancelled) setBackend(info)
      } catch (e) {
        if (!cancelled) setBootError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setBooting(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshHealth])

  const switchBackend = async (kind: BackendKind) => {
    setSwitching(true)
    try {
      setBackend(await reloadEmbedder(kind))
      setBootError(null)
    } catch (e) {
      setBootError(e instanceof Error ? e.message : String(e))
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">MiniKB</span>
          <span className="subtitle">浏览器端推理 · seekdb 混合检索</span>
        </div>
        <div className="badges">
          {backend && (
            <span className={`badge backend-${backend.kind}`} title={backend.error}>
              {backend.kind === 'webgpu' ? `WebGPU · FP16` : `WASM · INT8`}
              {backend.error ? '（已回退）' : ''}
            </span>
          )}
          {backend && <span className="badge" title={backend.adapter}>{backend.adapter}</span>}
          {backend && (
            <span className="badge">
              模型 {backend.modelBytes > 1_000_000 ? `${(backend.modelBytes / 1_048_576).toFixed(1)}MB` : `${backend.modelBytes}KB`} · 加载 {backend.loadMs}ms
            </span>
          )}
          {health && <span className="badge">文档 {health.docCount}</span>}
          {health?.engineVersion && <span className="badge">seekdb {health.engineVersion}</span>}
          {bootError && <span className="badge badge-error" title={bootError}>启动异常</span>}
        </div>
      </header>

      <nav className="tabs">
        {(
          [
            ['search', '检索'],
            ['import', '导入'],
            ['bench', '性能评测'],
            ['state', '状态'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'tab active' : 'tab'}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="content">
        {booting ? (
          <div className="panel center">
            <div className="spinner" />
            <p>正在初始化推理后端（WebGPU → WASM 自动回退）…</p>
          </div>
        ) : (
          <>
            {tab === 'search' && (
              <SearchTab backend={backend} switching={switching} onSwitch={switchBackend} />
            )}
            {tab === 'import' && <ImportTab onImported={refreshHealth} />}
            {tab === 'bench' && <BenchTab backend={backend} onDone={refreshHealth} />}
            {tab === 'state' && <StateTab health={health} onReset={refreshHealth} />}
          </>
        )}
      </main>
    </div>
  )
}

function SearchTab({
  backend,
  switching,
  onSwitch,
}: {
  backend: BackendInfo | null
  switching: boolean
  onSwitch: (kind: BackendKind) => void
}) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('hybrid')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [meta, setMeta] = useState<{ embedMs: number; serverMs: number; e2eMs: number } | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const doSearch = async (q: string, m: SearchMode) => {
    if (!q.trim()) return
    setSearching(true)
    setError(null)
    try {
      const t0 = performance.now()
      // fulltext-only mode needs no query vector — skip local inference
      const { vector, embedMs } = m === 'fulltext' ? { vector: null, embedMs: 0 } : await embedQuery(q)
      const res = await api.search(vector, q, 10, m)
      setHits(res.results)
      setMeta({ embedMs, serverMs: res.tookMs, e2eMs: Math.round(performance.now() - t0) })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="grid-two">
      <section className="panel">
        <h2>混合检索</h2>
        <p className="hint">
          查询向量由浏览器本地计算（{backend?.kind === 'webgpu' ? 'WebGPU/FP16' : 'WASM/INT8'}），
          全文 + 向量两路检索与 RRF 融合全部在 seekdb 内完成。
        </p>
        <input
          className="query-input"
          placeholder="输入查询，例如：模型量化后体积如何变化"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch(query, mode)}
        />
        <div className="row">
          <div className="mode-group">
            {(
              [
                ['hybrid', '混合 (RRF)'],
                ['vector', '仅向量'],
                ['fulltext', '仅全文'],
              ] as [SearchMode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                className={mode === m ? 'chip active' : 'chip'}
                onClick={() => {
                  setMode(m)
                  if (query) void doSearch(query, m)
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button className="primary" disabled={searching} onClick={() => doSearch(query, mode)}>
            {searching ? '检索中…' : '检索'}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {meta && hits && (
          <div className="timing-strip">
            <span>向量化 {meta.embedMs}ms</span>
            <span>seekdb 检索 {meta.serverMs}ms</span>
            <span>端到端 {meta.e2eMs}ms</span>
          </div>
        )}
        {hits && (
          <ol className="results">
            {hits.length === 0 && <li className="empty">无结果（库中可能还没有文档，请先到「导入」页添加）</li>}
            {hits.map((h, i) => (
              <li key={h.id} className="result-item">
                <div className="result-head">
                  <span className="rank">{i + 1}</span>
                  <span className="result-id">{h.id}</span>
                  {h.distance != null && (
                    <span className="result-dist">{Number(h.distance).toFixed(4)}</span>
                  )}
                </div>
                <p className="result-text">{h.text}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel">
        <h2>推理后端</h2>
        {backend && (
          <dl className="kv">
            <dt>当前后端</dt>
            <dd>
              {backend.kind === 'webgpu' ? 'WebGPU（GPU 加速）' : 'WASM（CPU）'}
              {backend.error ? ' — 已自动回退' : ''}
            </dd>
            <dt>模型精度</dt>
            <dd>{backend.dtype === 'fp16' ? 'FP16（45.3MB → 50.1%）' : 'INT8（22.8MB → 25.3%）'}</dd>
            <dt>模型路径</dt>
            <dd>{backend.modelPath}</dd>
            <dt>设备信息</dt>
            <dd>{backend.adapter || '—'}</dd>
            <dt>WASM 线程数</dt>
            <dd>{backend.numThreads}</dd>
            <dt>模型加载耗时</dt>
            <dd>{backend.loadMs}ms</dd>
          </dl>
        )}
        <div className="row">
          <button className="chip" disabled={switching} onClick={() => onSwitch('webgpu')}>
            切换到 WebGPU/FP16
          </button>
          <button className="chip" disabled={switching} onClick={() => onSwitch('wasm')}>
            切换到 WASM/INT8
          </button>
        </div>
        <p className="hint">WebGPU 不可用（如无独立显卡或被禁用）时，应用会自动回退到 WASM + INT8，并在顶栏徽章中明确标示当前后端。</p>
      </section>
    </div>
  )
}

function ImportTab({ onImported }: { onImported: () => void }) {
  const [docsText, setDocsText] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const logRef = useRef<HTMLPreElement>(null)

  const logLine = (msg: string) => {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
    requestAnimationFrame(() => {
      logRef.current?.scrollTo(0, logRef.current.scrollHeight)
    })
  }

  const doImport = async () => {
    const lines = docsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!lines.length) {
      logLine('请先输入文档（每行一篇）')
      return
    }
    setImporting(true)
    try {
      const t0 = performance.now()
      const { vectors, embedMs } = await embed(lines, true)
      logLine(`浏览器向量化 ${lines.length} 篇完成: ${embedMs}ms（${(lines.length / (embedMs / 1000)).toFixed(1)} 篇/秒）`)
      const imp = await api.import(lines.map((t) => ({ text: t })), vectors)
      logLine(
        `seekdb 写入 ${imp.added} 篇: ${imp.addMs}ms；索引刷新: ${imp.refreshMs}ms；库内文档总数: ${imp.docCount}`,
      )
      logLine(`导入总耗时 ${Math.round(performance.now() - t0)}ms — 刷新后新文档立即可检索`)
      setDocsText('')
      onImported()
    } catch (e) {
      logLine(`导入失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="grid-two">
      <section className="panel">
        <h2>增量导入文档</h2>
        <p className="hint">
          每行一篇文档。向量化在浏览器本地完成（不调用任何云端 API），写入 seekdb 后自动刷新索引，
          刷新完成即可检索到新文档——可反复导入，实现增量更新。
        </p>
        <textarea
          className="docs-input"
          rows={12}
          placeholder={'示例：\nseekdb 内置向量索引与全文索引…\n浏览器端推理优先使用 WebGPU…'}
          value={docsText}
          onChange={(e) => setDocsText(e.target.value)}
        />
        <div className="row">
          <button className="primary" disabled={importing} onClick={doImport}>
            {importing ? '导入中…' : '向量化并导入'}
          </button>
          <button className="chip" disabled={importing} onClick={() => setDocsText(SAMPLE_DOCS.join('\n'))}>
            填入示例文档（10 篇）
          </button>
          <button
            className="chip"
            disabled={importing}
            onClick={() => setDocsText(EVAL_DOCS.map((d) => d.text).join('\n'))}
          >
            填入评测文档集（24 篇）
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>导入日志</h2>
        <pre className="log" ref={logRef}>
          {log.length === 0 ? '尚无导入记录。' : log.join('\n')}
        </pre>
      </section>
    </div>
  )
}

function BenchTab({ backend, onDone }: { backend: BackendInfo | null; onDone: () => void }) {
  const [log, setLog] = useState<string[]>([])
  const [quality, setQuality] = useState<QualityReport | null>(null)
  const [latency, setLatency] = useState<LatencyReport | null>(null)
  const [incremental, setIncremental] = useState<IncrementalReport | null>(null)
  const [running, setRunning] = useState(false)
  const logRef = useRef<HTMLPreElement>(null)

  const logLine = (msg: string) => {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
    requestAnimationFrame(() => {
      logRef.current?.scrollTo(0, logRef.current.scrollHeight)
    })
  }

  const runFull = async () => {
    setRunning(true)
    setLog([])
    setQuality(null)
    setLatency(null)
    setIncremental(null)
    try {
      await api.reset()
      logLine('集合已重置（干净基线）')
      setIncremental(await runIncrementalCheck((m) => logLine(m)))
      setLatency(await runLatencyBench((m) => logLine(m)))
      setQuality(await runQualityEval((m) => logLine(m)))
      logLine('完整评测结束 — 下表数据即取中位数的实测结果')
      onDone()
    } catch (e) {
      logLine(`评测失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="bench">
      <section className="panel">
        <h2>性能评测与质量评估</h2>
        <p className="hint">
          内置 24 篇中文评测文档 + 6 条标注查询。流程：重置集合 → 增量导入验证 →
          延迟基准（{backend?.kind === 'webgpu' ? 'WebGPU/FP16' : 'WASM/INT8'}）→ Recall@K / nDCG@K 质量评测。
          延迟指标均取中位数，并区分首次请求与预热后的请求。
        </p>
        <button className="primary" disabled={running} onClick={runFull}>
          {running ? '评测运行中…' : '运行完整评测'}
        </button>
      </section>

      {incremental && (
        <section className="panel">
          <h3>增量导入验证（含写入与索引刷新测量）</h3>
          <dl className="kv">
            <dt>首批导入（{incremental.firstImport.count} 篇）</dt>
            <dd>
              向量化 {incremental.firstImport.embedMs}ms · 写入 {incremental.firstImport.addMs}ms · 刷新 {incremental.firstImport.refreshMs}ms
            </dd>
            <dt>增量导入（+{incremental.secondImport.count} 篇）</dt>
            <dd>
              向量化 {incremental.secondImport.embedMs}ms · 写入 {incremental.secondImport.addMs}ms · 刷新 {incremental.secondImport.refreshMs}ms
            </dd>
            <dt>文档数（导入前 → 导入后）</dt>
            <dd>{incremental.beforeCount} → {incremental.afterCount}</dd>
            <dt>刷新后能否检索到新增文档</dt>
            <dd>{incremental.foundAfterRefresh ? '✓ 是（索引刷新生效）' : '✗ 否'}</dd>
          </dl>
        </section>
      )}

      {latency && (
        <section className="panel">
          <h3>延迟基准（中位数，单位 ms）</h3>
          <dl className="kv">
            <dt>文档向量化（24 篇批量，本地推理）</dt>
            <dd>{latency.docEmbedTotalMs}ms（{latency.docEmbedPerDocMs}ms/篇）</dd>
          </dl>
          <table className="metric-table">
            <thead>
              <tr>
                <th>模式</th>
                <th>首次端到端</th>
                <th>端到端中位数</th>
                <th>seekdb 检索中位数</th>
                <th>查询向量化中位数</th>
              </tr>
            </thead>
            <tbody>
              {latency.search.map((s) => (
                <tr key={s.mode}>
                  <td>{modeLabel(s.mode)}</td>
                  <td>{s.firstE2EMs}</td>
                  <td>{s.medianE2EMs}</td>
                  <td>{s.medianServerMs}</td>
                  <td>{s.medianEmbedMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {quality && (
        <section className="panel">
          <h3>检索质量（内置标注集，24 文档 / 6 查询）</h3>
          <table className="metric-table">
            <thead>
              <tr>
                <th>模式</th>
                <th>Recall@5</th>
                <th>Recall@10</th>
                <th>nDCG@5</th>
                <th>nDCG@10</th>
              </tr>
            </thead>
            <tbody>
              {quality.modes.map((m) => (
                <tr key={m.mode}>
                  <td>{modeLabel(m.mode)}</td>
                  <td>{m.recallAt5.toFixed(3)}</td>
                  <td>{m.recallAt10.toFixed(3)}</td>
                  <td>{m.ndcgAt5.toFixed(3)}</td>
                  <td>{m.ndcgAt10.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">评测后端: {quality.backend}（量化模型），总耗时 {quality.totalMs}ms</p>
        </section>
      )}

      <section className="panel">
        <h3>评测日志</h3>
        <pre className="log" ref={logRef}>
          {log.length === 0 ? '点击「运行完整评测」开始。' : log.join('\n')}
        </pre>
      </section>
    </div>
  )
}

function StateTab({ health, onReset }: { health: HealthInfo | null; onReset: () => void }) {
  const [message, setMessage] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)

  const doReset = async () => {
    if (!window.confirm('确认清空整个知识库集合？此操作不可撤销。')) return
    setResetting(true)
    try {
      const res = await api.reset()
      setMessage(`已重置: ${JSON.stringify(res)}`)
      onReset()
    } catch (e) {
      setMessage(`重置失败: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="grid-two">
      <section className="panel">
        <h2>会话状态（seekdb）</h2>
        <pre className="log">{JSON.stringify(health, null, 2)}</pre>
      </section>
      <section className="panel">
        <h2>操作</h2>
        <button className="danger" disabled={resetting} onClick={doReset}>
          {resetting ? '重置中…' : '清空知识库（重建集合）'}
        </button>
        {message && <p className="hint">{message}</p>}
        <p className="hint">
          seekdb 以嵌入式模式运行在本地，集合与索引持久化于数据目录；服务器重启后会话自动恢复
          （initMs 为本次会话的连接耗时）。
        </p>
      </section>
    </div>
  )
}

function modeLabel(mode: SearchMode): string {
  return mode === 'hybrid' ? '混合 (RRF)' : mode === 'vector' ? '仅向量' : '仅全文'
}
