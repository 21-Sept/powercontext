# MiniKB 技术说明（一页）

浏览器端 AI 推理 + seekdb 混合检索迷你知识库。所有文档/查询向量化均在用户浏览器本地完成（Transformers.js / ONNX Runtime Web），存储与检索全部由 seekdb 完成，无任何云端推理。

## 1. 模型与量化

- **模型**：`BAAI/bge-small-zh-v1.5`（HuggingFace 公开模型，MIT 许可，512 维，中文语义检索专用），官方用法：查询前加指令前缀「为这个句子生成表示以用于检索相关文章：」+ CLS 池化 + L2 归一化。
- **量化方式**：optimum 导出 FP32 ONNX 后，用 onnxruntime.transformers 的 `convert_float_to_float16`（保留 IO 类型）生成 FP16；用 `quantize_dynamic(QInt8)` 生成 INT8（仅权重动态量化）。脚本见 `models/quantize.py`。

| 精度 | 体积 | 相对 FP32 | 压缩比（FP32/本行） | 用途 |
|---|---|---|---|---|
| FP32 基线 | 90.44 MB | 100% | 1.00× | 离线质量基线 |
| FP16 | 45.28 MB | 50.07% | 2.00× | WebGPU 后端 |
| INT8 | 22.80 MB | 25.20% | 3.97× | WASM 后端 |

- **质量变化**（离线评测，10 条中文文本，与 FP32 的余弦相似度）：FP16 mean=**1.0000**（无损）；INT8 mean=**0.9656**（min 0.9601）；三档精度 top-3 检索排序完全一致。
- **质量变化**（应用内实测，24 文档 / 6 条标注查询，Recall@K / nDCG@K）：

| 模式 | FP16 精度 | INT8 精度 |
|---|---|---|
| 仅向量 nDCG@5 / nDCG@10 | 0.967 / 0.892 | 0.984 / 0.897 |
| 混合 nDCG@5 / nDCG@10 | 0.910 / 0.859 | 0.926 / 0.864 |
| Recall@5 / Recall@10（两种精度一致） | 1.000 / 0.944 | 1.000 / 0.944 |

量化前后召回完全一致、nDCG 波动 < 0.02，检索质量无明显下降。

## 2. 端侧运行

- **运行时**：Transformers.js（onnxruntime-web），浏览器内执行 embedding 推理；模型文件由应用服务静态提供，计算 100% 发生在用户设备。
- **后端选择**：启动时检测 `navigator.gpu` 并创建 WebGPU 会话（加载 FP16 模型）；失败（无 GPU / 驱动禁用 / 不支持）时 catch 异常自动回退 WASM + INT8。已实测两种路径：正常环境走 WebGPU；强制 `?backend=wasm` 与人为 WebGPU 初始化失败时均自动落到 WASM，顶栏徽章与「推理后端」面板实时显示当前后端。
- **WASM 加速**：服务端下发 COOP/COEP 头使页面 `crossOriginIsolated`，启用 SharedArrayBuffer + 4 线程推理。
- **模型加载**：WebGPU/FP16 冷启动 3808 ms（45.3 MB）；WASM/INT8 1356 ms（22.8 MB）；重复访问走浏览器 Cache API，不再重复下载。

## 3. seekdb 存储与混合检索

- **部署**：seekdb-js 1.4.0 嵌入式引擎（随 Node 服务进程运行，Linux/WSL2），引擎版本 `5.7.25-OceanBase seekdb-v1.4.0.0`；数据库 `test`，集合 `kb_docs`。
- **集合结构**：`id`（文档 ID）、`text`（原文，全文检索）、`metadata`（JSON 元数据）、`embedding`（512 维向量）。
- **混合检索**：`collection.hybridSearch({ query: { whereDocument: { $contains: 查询词 } }, knn: { queryEmbeddings: 查询向量 }, rank: { rrf: {} }, nResults })` —— 全文与向量两路检索及 RRF 融合**全部在 seekdb 内完成**，客户端只提交查询词与查询向量、只接收融合后的排序结果，不做任何两路结果拼合。仅向量用 `collection.query({ queryEmbeddings })`，仅全文用不带 knn 的 `hybridSearch`。
- **增量与索引刷新**：导入即 `add`，随后调用 `refresh_index()`；实测刷新完成后新增文档立即可被检索（应用内置评测逐次验证 ✓）。删除走 `delete` + 刷新。
- **集合与会话状态**：集合持久化于嵌入式引擎数据目录；服务器重启后自动重连原集合（文档仍在），页面显示数据库/集合/引擎版本/最近操作等会话信息，并提供「重置集合」一键恢复干净基线。

## 4. 状态管理与性能优化

**优化点**：① 文档向量化整批推理（24 篇/批）；② 按后端匹配精度（WebGPU→FP16、WASM→INT8）；③ 全文模式跳过查询向量化；④ WASM 多线程（crossOriginIsolated）；⑤ 模型二次加载走浏览器缓存；⑥ 批量导入后一次性 `refresh_index()`。

**实测结果**（2026-10-30，Windows 11 + WSL2（seekdb 嵌入式），Chrome 最新版，NVIDIA GPU（lovelace），内置 24 篇中文文档 + 6 条标注查询；延迟取中位数、区分首次与预热）：

| 指标 | WebGPU + FP16 | WASM + INT8 |
|---|---|---|
| 浏览器加载模型体积 | 45.3 MB | 22.8 MB |
| 模型加载（冷启动） | 3808 ms | 1356 ms |
| 文档向量化（24 篇批量） | 105 ms（4.3 ms/篇） | 1476 ms（62 ms/篇） |
| 查询向量化（中位） | 21 ms | 63 ms |
| seekdb 混合检索（中位） | 9 ms | 8 ms |
| 混合检索端到端（首次 / 中位） | 104 / 90 ms | 124 / 128 ms |
| 仅向量端到端（中位） | 87 ms | 121 ms |
| 仅全文端到端（中位） | 16 ms | 14 ms |
| 增量导入 18 篇（写入 / 刷新） | 59 / 401 ms | 50 / 301 ms |
| 混合检索质量 nDCG@5 | 0.910 | 0.926 |

**结论**：WebGPU+FP16 下文档向量化吞吐约 4.3 ms/篇、混合检索端到端 90 ms；WASM+INT8 降级路径功能完整、质量一致，端到端 128 ms。批处理与按后端选精度是两项主要收益来源（WASM 下批量向量化较逐条冷调用快约一个数量级，WebGPU 下 FP16 推理比 WASM 快约 14 倍）。
