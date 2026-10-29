import { api } from './api'
import { embed, embedQuery, getBackendInfo } from './embedder'

export type SearchMode = 'hybrid' | 'vector' | 'fulltext'

export interface EvalDoc {
  id: string
  text: string
}

export interface EvalQuery {
  id: string
  text: string
  relevant: string[]
}

export const EVAL_DOCS: EvalDoc[] = [
  { id: 'a1', text: '向量检索通过 HNSW 索引实现近似最近邻查询，支持余弦距离度量。' },
  { id: 'a2', text: '高维向量经过嵌入模型映射后，语义相近的文本在空间中彼此靠近。' },
  { id: 'a3', text: 'HNSW 图索引的构建参数包括 m 与 ef_construction，影响召回率与内存占用。' },
  { id: 'a4', text: '余弦相似度衡量两个向量方向的接近程度，常用于语义匹配任务。' },
  { id: 'a5', text: '近似最近邻搜索在牺牲少量精度的同时，将查询复杂度降到对数级别。' },
  { id: 'a6', text: '向量维度过低会损失语义信息，过高则会增加索引构建与查询开销。' },
  { id: 'b1', text: '模型量化将 32 位浮点权重压缩为 16 位或 8 位整数，减小模型体积。' },
  { id: 'b2', text: 'INT8 动态量化只在推理时对权重做量化，激活值保持浮点精度。' },
  { id: 'b3', text: 'FP16 量化将模型体积压缩一半，精度损失几乎可以忽略不计。' },
  { id: 'b4', text: '量化前后的检索质量可以通过 Recall@K 与 nDCG@K 指标评估。' },
  { id: 'b5', text: '8 比特量化使模型体积缩小到原来的四分之一，适合浏览器端加载。' },
  { id: 'b6', text: '权重量化带来的误差会在深层网络中小幅累积，通常表现为相似度轻微下降。' },
  { id: 'c1', text: '混合检索同时执行全文检索与向量检索，并融合两路结果。' },
  { id: 'c2', text: 'RRF 倒数排名融合是一种简单有效的多路检索结果合并算法。' },
  { id: 'c3', text: '全文检索擅长精确关键词匹配，向量检索擅长捕捉语义相关性。' },
  { id: 'c4', text: '两路检索结果通过排名融合后，整体召回率通常优于单路检索。' },
  { id: 'c5', text: 'IK 分词器支持中文文本的智能切分，是全文索引的基础组件。' },
  { id: 'c6', text: '混合检索在数据库端完成融合，避免将候选集传回客户端再排序。' },
  { id: 'd1', text: 'WebGPU 允许浏览器利用显卡并行计算，加速神经网络推理。' },
  { id: 'd2', text: '当 WebGPU 不可用时，推理自动回退到 WASM 后端运行。' },
  { id: 'd3', text: '推理后端切换后，UI 应明确显示当前使用的是 GPU 还是 CPU。' },
  { id: 'd4', text: '浏览器本地推理避免将用户文档发送到云端，保护数据隐私。' },
  { id: 'd5', text: 'GPU 上的 FP16 推理速度远快于 CPU 上的 FP32 推理。' },
  { id: 'd6', text: 'WASM 后端配合 INT8 量化模型，在纯 CPU 环境下也能流畅运行。' },
]

export const EVAL_QUERIES: EvalQuery[] = [
  { id: 'Q1', text: '向量检索的索引结构', relevant: ['a1', 'a3', 'a5'] },
  { id: 'Q2', text: '模型量化后的体积变化', relevant: ['b1', 'b3', 'b5'] },
  { id: 'Q3', text: '多路检索结果如何融合', relevant: ['c1', 'c2', 'c6'] },
  { id: 'Q4', text: '浏览器端 GPU 推理', relevant: ['d1', 'd3', 'd5'] },
  { id: 'Q5', text: '量化对检索质量的影响', relevant: ['b2', 'b4', 'b6'] },
  { id: 'Q6', text: '中文分词的全文检索', relevant: ['c3', 'c5'] },
]

export interface ModeMetrics {
  mode: SearchMode
  recallAt5: number
  recallAt10: number
  ndcgAt5: number
  ndcgAt10: number
  perQuery: { query: string; recallAt5: number; ndcgAt5: number }[]
}

export interface QualityReport {
  backend: string
  docCount: number
  modes: ModeMetrics[]
  totalMs: number
}

export interface IncrementalReport {
  beforeCount: number
  afterCount: number
  firstImport: { count: number; embedMs: number; addMs: number; refreshMs: number }
  secondImport: { count: number; embedMs: number; addMs: number; refreshMs: number }
  foundAfterRefresh: boolean
}

export interface LatencyReport {
  backend: string
  docEmbedTotalMs: number
  docEmbedPerDocMs: number
  search: {
    mode: SearchMode
    firstE2EMs: number
    medianE2EMs: number
    medianServerMs: number
    medianEmbedMs: number
    reps: number
  }[]
  totalMs: number
}

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function recallAt(hits: string[], relevant: string[], k: number): number {
  const top = hits.slice(0, k)
  const hit = relevant.filter((r) => top.includes(r)).length
  return relevant.length ? hit / relevant.length : 0
}

function ndcgAt(hits: string[], relevant: string[], k: number): number {
  const rel = new Set(relevant)
  const ideal = Math.min(relevant.length, k)
  let idcg = 0
  for (let i = 0; i < ideal; i++) idcg += 1 / Math.log2(i + 2)
  if (!idcg) return 0
  let dcg = 0
  for (let i = 0; i < Math.min(hits.length, k); i++) {
    if (rel.has(hits[i])) dcg += 1 / Math.log2(i + 2)
  }
  return dcg / idcg
}

export async function runQualityEval(
  onProgress?: (msg: string) => void,
): Promise<QualityReport> {
  const t0 = performance.now()
  const { embedMs } = await embedQuery('预热查询')
  onProgress?.(`预热完成 (${embedMs}ms)`)

  const modes: SearchMode[] = ['vector', 'fulltext', 'hybrid']
  const modeReports: ModeMetrics[] = []

  for (const mode of modes) {
    onProgress?.(`评测 ${mode} 模式…`)
    const perQuery: ModeMetrics['perQuery'] = []
    let r10 = 0
    let n10 = 0
    for (const q of EVAL_QUERIES) {
      const { vector } = mode === 'fulltext' ? { vector: null } : await embedQuery(q.text)
      const res = await api.search(vector, q.text, 10, mode)
      const hits = res.results.map((r) => r.id)
      perQuery.push({
        query: q.id,
        recallAt5: recallAt(hits, q.relevant, 5),
        ndcgAt5: ndcgAt(hits, q.relevant, 5),
      })
      r10 += recallAt(hits, q.relevant, 10)
      n10 += ndcgAt(hits, q.relevant, 10)
    }
    modeReports.push({
      mode,
      recallAt5: median(perQuery.map((p) => p.recallAt5)),
      recallAt10: r10 / EVAL_QUERIES.length,
      ndcgAt5: median(perQuery.map((p) => p.ndcgAt5)),
      ndcgAt10: n10 / EVAL_QUERIES.length,
      perQuery,
    })
  }

  return {
    backend: getBackendInfo() ? `${getBackendInfo()!.kind}/${getBackendInfo()!.dtype}` : 'unknown',
    docCount: EVAL_DOCS.length,
    modes: modeReports,
    totalMs: Math.round(performance.now() - t0),
  }
}

export async function runLatencyBench(
  onProgress?: (msg: string) => void,
): Promise<LatencyReport> {
  const t0 = performance.now()
  // 向量化吞吐测量（批量 24 篇，不写入——文档已由增量导入阶段写入 seekdb）
  const { embedMs } = await embed(EVAL_DOCS.map((d) => d.text), true)
  onProgress?.(`文档向量化完成: ${embedMs}ms (${EVAL_DOCS.length} 篇)`)

  const modes: SearchMode[] = ['vector', 'fulltext', 'hybrid']
  const search: LatencyReport['search'] = []
  for (const mode of modes) {
    const e2e: number[] = []
    const server: number[] = []
    const emb: number[] = []
    let firstE2E = 0
    for (let i = 0; i < EVAL_QUERIES.length; i++) {
      const q = EVAL_QUERIES[i]
      const s0 = performance.now()
      const { vector, embedMs: em } =
        mode === 'fulltext' ? { vector: null, embedMs: 0 } : await embedQuery(q.text)
      const res = await api.search(vector, q.text, 10, mode)
      const dt = performance.now() - s0
      e2e.push(dt)
      server.push(res.tookMs)
      emb.push(em)
      if (i === 0) firstE2E = dt
      onProgress?.(`${mode} ${i + 1}/${EVAL_QUERIES.length}: ${Math.round(dt)}ms`)
    }
    search.push({
      mode,
      firstE2EMs: Math.round(firstE2E),
      medianE2EMs: Math.round(median(e2e)),
      medianServerMs: Math.round(median(server)),
      medianEmbedMs: Math.round(median(emb)),
      reps: e2e.length,
    })
  }

  return {
    backend: getBackendInfo() ? `${getBackendInfo()!.kind}/${getBackendInfo()!.dtype}` : 'unknown',
    docEmbedTotalMs: embedMs,
    docEmbedPerDocMs: Math.round(embedMs / EVAL_DOCS.length),
    search,
    totalMs: Math.round(performance.now() - t0),
  }
}

export async function runIncrementalCheck(
  onProgress?: (msg: string) => void,
): Promise<IncrementalReport> {
  const first = EVAL_DOCS.slice(0, 6)
  const t1 = performance.now()
  const { vectors: v1 } = await embed(first.map((d) => d.text), true)
  const firstEmbedMs = Math.round(performance.now() - t1)
  const imp1 = await api.import(first, v1)
  const before = (await api.docs()).count
  onProgress?.(`首批 6 篇导入完成, docCount=${before}`)

  const second = EVAL_DOCS.slice(6)
  const t2 = performance.now()
  const { vectors: v2 } = await embed(second.map((d) => d.text), true)
  const secondEmbedMs = Math.round(performance.now() - t2)
  const imp2 = await api.import(second, v2)
  const after = (await api.docs()).count
  onProgress?.(`增量 ${second.length} 篇导入: add=${imp2.addMs}ms refresh=${imp2.refreshMs}ms, docCount=${after}`)

  const { vector } = await embedQuery('模型量化后的体积变化')
  const res = await api.search(vector, '模型量化后的体积变化', 10, 'hybrid')
  const found = res.results.some((r) => r.id.startsWith('b'))
  onProgress?.(`刷新后检索新增文档: ${found ? '命中 ✓' : '未命中 ✗'}`)
  return {
    beforeCount: before,
    afterCount: after,
    firstImport: { count: first.length, embedMs: firstEmbedMs, addMs: imp1.addMs, refreshMs: imp1.refreshMs },
    secondImport: { count: second.length, embedMs: secondEmbedMs, addMs: imp2.addMs, refreshMs: imp2.refreshMs },
    foundAfterRefresh: found,
  }
}
