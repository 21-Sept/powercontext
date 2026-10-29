#!/usr/bin/env python3
"""Quantization quality check: cosine similarity of fp16/int8 embeddings vs fp32.
Model: BAAI/bge-small-zh-v1.5 — CLS pooling + query instruction (official usage)."""
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

SRC = "/home/spet/models/src-zh"
TOKENIZER = AutoTokenizer.from_pretrained(SRC)

TEXTS = [
    "向量检索支持 HNSW 索引与余弦距离",
    "混合检索由数据库端完成 RRF 融合",
    "浏览器本地运行 embedding 推理，支持 WebGPU 与 WASM 后端",
    "增量导入文档后调用索引刷新即可检索",
    "阶跃星辰 x OceanBase seekdb 向量数据库竞赛",
    "The quick brown fox jumps over the lazy dog",
    "量化将模型体积压缩到四分之一，检索质量几乎不变",
    "全文检索使用 IK 中文分词器智能模式",
    "模型量化技术用于降低内存占用和加速推理",
    "状态管理包括集合会话与索引刷新",
]


def embed(session, texts):
    enc = TOKENIZER(texts, padding=True, truncation=True, max_length=128, return_tensors="np")
    out = session.run(
        None,
        {
            "input_ids": enc["input_ids"].astype(np.int64),
            "attention_mask": enc["attention_mask"].astype(np.int64),
            "token_type_ids": enc["token_type_ids"].astype(np.int64),
        },
    )[0]
    pooled = out[:, 0, :]  # CLS pooling (bge official)
    pooled = pooled / np.linalg.norm(pooled, axis=1, keepdims=True)
    return pooled


def main():
    paths = {
        "fp32": "/home/spet/models/dist-zh/fp32/model.onnx",
        "fp16": "/home/spet/models/dist-zh/fp16/onnx/model_fp16.onnx",
        "int8": "/home/spet/models/dist-zh/int8/onnx/model_quantized.onnx",
    }
    embs = {}
    for name, p in paths.items():
        sess = ort.InferenceSession(p, providers=["CPUExecutionProvider"])
        embs[name] = embed(sess, TEXTS)
        print(f"[qual] {name} embedding shape={embs[name].shape}")

    for name in ("fp16", "int8"):
        sims = (embs["fp32"] * embs[name]).sum(axis=1)
        print(f"[qual] {name} vs fp32 cosine: mean={sims.mean():.6f} min={sims.min():.6f}")
        print(f"[qual] {name} vs fp32 per-text: {np.round(sims, 5).tolist()}")

    # retrieval sanity: query "向量检索" should rank text[0] first under fp32 and fp16/int8
    q = embed(
        ort.InferenceSession(paths["fp32"], providers=["CPUExecutionProvider"]),
        ["为这个句子生成表示以用于检索相关文章：向量检索与索引"],
    )
    for name, e in embs.items():
        order = np.argsort(-(e @ q[0]))[:3].tolist()
        print(f"[qual] top-3 under {name}: {order} -> {[TEXTS[i][:14] for i in order]}")


if __name__ == "__main__":
    main()
