# MiniKB — 浏览器端推理 + seekdb 混合检索迷你知识库

阶跃星辰 × seekdb 2026 竞赛项目（`stepfun` 目录）。文档与查询的向量化 100% 在浏览器本地完成（Transformers.js / ONNX Runtime Web，无云端推理）；存储与向量/全文混合检索全部由 seekdb 完成。

```
浏览器（用户设备）                          Node 服务（Linux / WSL2）
┌──────────────────────────────┐        ┌─────────────────────────────┐
│ React UI（Vite 构建产物）      │  HTTP  │ Express 静态服务             │
│  · Transformers.js 本地推理   │ ─────► │  · /models  FP16/INT8 模型  │
│  · WebGPU(FP16)→WASM(INT8)  │ ◄───── │  · /api/*   导入/检索/状态   │
│    自动降级，UI 显示后端       │        │  · seekdb 嵌入式引擎         │
└──────────────────────────────┘        │    （向量 + 全文 + RRF 融合）│
                                        └─────────────────────────────┘
```

## 目录结构

```
stepfun/
├── app/        # 前端：React + Vite + TypeScript + Transformers.js
│   ├── src/lib/embedder.ts   # 本地推理：后端选择/降级/批处理
│   ├── src/lib/bench.ts      # 内置 24 篇中文评测语料 + 6 条标注查询
│   └── public/wasm/          # ONNX Runtime WASM 运行时（jspi 多线程）
├── server/     # 后端：Express + seekdb-js 1.4.0（嵌入式）
│   └── scripts/run.sh        # 启动脚本（Node/绑定/环境自动处理）
├── models/     # 量化模型与工具
│   ├── fp16/  int8/          # 量化后模型（浏览器加载）
│   ├── quantize.py           # FP32→FP16/INT8 量化脚本
│   ├── quality_check.py      # 量化质量离线评测（余弦相似度）
│   └── sizes.json            # 量化体积记录
└── TECH.md     # 一页技术说明（模型/量化/性能实测）
```

## 环境要求

- **浏览器**：最新版 Chrome / Edge（需要 WebGPU；无 GPU 时自动降级 WASM）
- **服务端**：Linux（原生或 WSL2）+ Node.js ≥ 20。seekdb 嵌入式引擎为 Linux 原生绑定，Windows 原生不支持。
- 首次启动需联网：下载 seekdb 原生绑定（缓存于 `~/.seekdb/bindings`）。

## 启动步骤

### 1. 安装依赖

```bash
# 前端（任意平台）
cd app && npm install && npm run build

# 服务端（在 Linux / WSL2 内执行；seekdb 依赖 Linux 原生绑定）
cd ../server && npm install
```

### 2. 启动服务（Linux / WSL2）

```bash
cd server
PORT=8787 SEEKDB_DATA_DIR=$HOME/stepfun-data ./scripts/run.sh
```

Windows 用户通过 WSL2 启动（在仓库的 `stepfun/server` 目录下执行；WSL 会继承当前目录）：

```powershell
wsl -d Ubuntu -- bash -lc "PORT=8787 SEEKDB_DATA_DIR=~/stepfun-data ./scripts/run.sh"
```

### 3. 打开应用

浏览器访问 `http://localhost:8787`，即可：导入文档 → 本地向量化 → 写入 seekdb → 混合检索。

- 顶栏徽章显示当前推理后端（WebGPU/FP16 或 WASM/INT8）与 GPU 设备名。
- 强制指定后端：`http://localhost:8787/?backend=wasm`（或 `webgpu`），用于验证降级路径。
- 「性能评测」页内置完整评测：重置集合 → 增量导入+索引刷新验证 → 分模式延迟基准（中位数，区分首次/预热）→ Recall@K / nDCG@K 质量评测。

## 模型获取与量化（复现）

```bash
# 1) 下载模型（中国大陆可用镜像）
export HF_ENDPOINT=https://hf-mirror.com
python -m venv ~/modelenv && ~/modelenv/bin/pip install optimum onnx onnxruntime transformers sentencepiece torch
mkdir -p ~/models/src-zh
#    从 https://huggingface.co/BAAI/bge-small-zh-v1.5 下载全部文件到 ~/models/src-zh

# 2) 量化：FP32 导出 → FP16 → INT8（记录 sizes.json）
cd models
python quantize.py ~/models/src-zh ~/models/dist-zh

# 3) 质量离线评测（FP16/INT8 与 FP32 余弦相似度 + 检索排序一致性）
python quality_check.py

# 4) 将 fp16/onnx/model_fp16.onnx、int8/onnx/model_quantized.onnx
#    连同 tokenizer/config 复制到 models/fp16、models/int8（仓库已含成品）
```

量化产物体积（实测）：FP32 90.44 MB → FP16 45.28 MB（50.07%，压缩比 2.00×）→ INT8 22.80 MB（25.20%，压缩比 3.97×）。

## API

| 端点 | 说明 |
|---|---|
| `GET /api/health` | 健康状态：引擎版本、文档数、最近导入/检索 |
| `GET /api/session` | 会话信息：数据库/集合/启动耗时 |
| `POST /api/import` | `{documents:[{id,text,metadata}], embeddings:number[][]}` 写入并刷新索引 |
| `POST /api/search` | `{embedding:number[]\|null, contains, topk, mode:hybrid\|vector\|fulltext}` |
| `DELETE /api/docs/:id` | 删除单篇文档并刷新索引 |
| `POST /api/reset` | 重建集合（干净基线） |

## 评测方法

- **语料**：`app/src/lib/bench.ts` 内置 24 篇中文文档（向量检索 / 量化 / 混合检索 / 端侧推理四主题）+ 6 条标注查询。
- **计时口径**：分阶段计时（模型加载、文档向量化、写入+索引刷新、查询向量化、seekdb 检索、端到端）；每项重复 6 次取**中位数**；区分首次请求与预热后请求。
- **质量口径**：Recall@K 与 nDCG@K（k=5,10），FP16 与 INT8 在同一标注集上对比，并附 FP32 离线余弦基准。
- 详细结果与说明见 [TECH.md](./TECH.md)。
