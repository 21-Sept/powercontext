import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'

export type BackendKind = 'webgpu' | 'wasm'

export interface BackendInfo {
  kind: BackendKind
  dtype: 'fp16' | 'q8'
  modelPath: string
  modelBytes: number
  loadMs: number
  adapter: string
  numThreads: number
  error?: string
}

export interface EmbedResult {
  vectors: number[][]
  embedMs: number
  texts: string[]
}

let extractor: FeatureExtractionPipeline | null = null
let backendInfo: BackendInfo | null = null
let loading: Promise<BackendInfo> | null = null

// env.backends.onnx is typed read-only in the d.ts but is a plain mutable
// object at runtime; cast to configure the WASM backend.
const onnxEnv = env.backends.onnx as {
  wasm?: { wasmPaths?: unknown; numThreads?: number }
}
const wasmEnv = (onnxEnv.wasm ??= {})

env.allowLocalModels = true
env.allowRemoteModels = false
env.useBrowserCache = true
// The factory build must export webgpuInit (ORT's webgpu bundle requires it even
// for wasm-only sessions): use the jspi build (webgpuInit + pthreads), not jsep.
wasmEnv.wasmPaths = {
  mjs: '/wasm/ort-wasm-simd-threaded.jspi.mjs',
  wasm: '/wasm/ort-wasm-simd-threaded.jspi.wasm',
}
wasmEnv.numThreads = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1))

const MODELS = {
  webgpu: { path: '/models/fp16', dtype: 'fp16' as const, bytes: 47_479_846 },
  wasm: { path: '/models/int8', dtype: 'q8' as const, bytes: 23_902_398 },
}

// BAAI/bge-small-zh-v1.5 official usage: CLS pooling + query instruction prefix
const QUERY_INSTRUCTION = '为这个句子生成表示以用于检索相关文章：'

function webgpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && !!navigator.gpu
}

async function gpuAdapterLabel(): Promise<string> {
  if (!webgpuAvailable()) return ''
  try {
    const adapter = await navigator.gpu?.requestAdapter()
    if (!adapter?.info) return 'WebGPU 可用'
    const i = adapter.info
    return [i.vendor, i.architecture, i.description].filter(Boolean).join(' / ')
  } catch {
    return 'WebGPU 可用'
  }
}

export async function loadEmbedder(preferred: BackendKind = 'webgpu'): Promise<BackendInfo> {
  if (loading) return loading
  loading = doLoad(preferred).finally(() => {
    loading = null
  })
  return loading
}

async function doLoad(preferred: BackendKind): Promise<BackendInfo> {
  const t0 = performance.now()
  const useWebgpu = preferred === 'webgpu' && webgpuAvailable()

  if (useWebgpu) {
    try {
      extractor = await pipeline('feature-extraction', MODELS.webgpu.path, {
        device: 'webgpu',
        dtype: 'fp16',
      })
      backendInfo = {
        kind: 'webgpu',
        dtype: MODELS.webgpu.dtype,
        modelPath: MODELS.webgpu.path,
        modelBytes: MODELS.webgpu.bytes,
        loadMs: Math.round(performance.now() - t0),
        adapter: await gpuAdapterLabel(),
        numThreads: (wasmEnv.numThreads ?? 1) as number,
      }
      return backendInfo
    } catch (e) {
      console.warn('[embedder] WebGPU 初始化失败，回退到 WASM:', e)
      extractor = null
    }
  }

  extractor = await pipeline('feature-extraction', MODELS.wasm.path, {
    device: 'wasm',
    dtype: 'q8',
  })
  backendInfo = {
    kind: 'wasm',
    dtype: MODELS.wasm.dtype,
    modelPath: MODELS.wasm.path,
    modelBytes: MODELS.wasm.bytes,
    loadMs: Math.round(performance.now() - t0),
    adapter: 'WASM (CPU)',
    numThreads: (wasmEnv.numThreads ?? 1) as number,
  }
  if (useWebgpu) backendInfo.error = 'WebGPU 加载失败，已回退'
  return backendInfo
}

/** Switch backend at runtime: dispose the current session, then load the requested one. */
export async function reloadEmbedder(kind: BackendKind): Promise<BackendInfo> {
  if (extractor) {
    try {
      await extractor.dispose()
    } catch {
      /* ignore */
    }
    extractor = null
  }
  backendInfo = null
  return loadEmbedder(kind)
}

export function getBackendInfo(): BackendInfo | null {
  return backendInfo
}

export async function embed(texts: string[], measure = false): Promise<EmbedResult> {
  if (!extractor) throw new Error('embedder 未初始化')
  if (!texts.length) return { vectors: [], embedMs: 0, texts: [] }
  const t0 = performance.now()
  const out = await extractor(texts, { pooling: 'cls', normalize: true })
  const vectors = (await out.tolist()) as number[][]
  return { vectors, embedMs: measure ? Math.round(performance.now() - t0) : 0, texts }
}

export async function embedQuery(text: string): Promise<{ vector: number[]; embedMs: number }> {
  const { vectors, embedMs } = await embed([QUERY_INSTRUCTION + text], true)
  return { vector: vectors[0], embedMs }
}
