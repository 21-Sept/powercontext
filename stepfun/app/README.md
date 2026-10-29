# app — 前端

React + Vite + TypeScript + Transformers.js。文档/查询向量化在浏览器本地执行；WebGPU 优先（FP16），不可用时自动降级 WASM（INT8）。

- `src/lib/embedder.ts` — 本地推理：后端检测与降级、批处理、BGE 查询指令前缀 + CLS 池化
- `src/lib/bench.ts` — 内置 24 篇中文评测语料 + 6 条标注查询、延迟基准与质量评测
- `public/wasm/` — ONNX Runtime WASM 运行时（jspi 多线程构建）

```bash
npm install
npm run dev      # 开发（Vite，代理 /api 与 /models 到 :8787）
npm run build    # 生产构建到 dist/（由 server 静态服务）
```
