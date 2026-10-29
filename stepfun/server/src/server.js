/**
 * Mini knowledge base server — Express + seekdb embedded (hybrid search).
 * All vectorization happens in the browser; this server only stores and
 * searches via seekdb (fulltext + HNSW + RRF fusion inside the DB).
 */
import express from "express";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  config,
  ensureSession,
  importDocuments,
  search,
  getDoc,
  deleteDoc,
  getDocCount,
  resetCollection,
  sessionInfo,
} from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const MODELS_DIR =
  process.env.SEEKDB_MODELS_DIR || path.join(__dirname, "..", "..", "models");
const APP_DIST_DIR = path.join(__dirname, "..", "..", "app", "dist");

const app = express();
app.use(express.json({ limit: "50mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Cross-origin isolation enables SharedArrayBuffer, so the ONNX Runtime
  // WASM backend can use multiple threads.
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/api/health", async (_req, res, next) => {
  try {
    await ensureSession();
    const docCount = await getDocCount();
    res.json({ ok: true, docCount, ...sessionInfo() });
  } catch (e) {
    next(e);
  }
});

app.get("/api/session", (_req, res) => {
  res.json(sessionInfo());
});

app.post("/api/import", async (req, res, next) => {
  try {
    const { documents, embeddings } = req.body ?? {};
    if (!Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ error: "documents must be a non-empty array" });
    }
    if (!Array.isArray(embeddings) || embeddings.length !== documents.length) {
      return res
        .status(400)
        .json({ error: "embeddings array must match documents length" });
    }
    const items = documents.map((d, i) => ({
      id: typeof d === "string" ? undefined : d?.id,
      text: typeof d === "string" ? d : d?.text,
      metadata: typeof d === "string" ? {} : d?.metadata ?? {},
      embedding: embeddings[i],
    }));
    for (const it of items) {
      if (typeof it.text !== "string" || it.text.length === 0) {
        return res.status(400).json({ error: "each document needs non-empty text" });
      }
    }
    const result = await importDocuments(items);
    const docCount = await getDocCount();
    res.json({ ...result, docCount });
  } catch (e) {
    next(e);
  }
});

app.post("/api/search", async (req, res, next) => {
  try {
    const { embedding, contains, topk, mode } = req.body ?? {};
    if (typeof contains !== "string" || !contains) {
      return res.status(400).json({ error: "contains (string) is required" });
    }
    const m = mode === "vector" || mode === "fulltext" ? mode : "hybrid";
    // fulltext-only queries don't need a query vector (saves browser-side
    // inference); vector/hybrid require it.
    if (m !== "fulltext" && !Array.isArray(embedding)) {
      return res
        .status(400)
        .json({ error: "embedding (array) is required for vector/hybrid modes" });
    }
    const n = Math.min(Math.max(Number(topk) || 10, 1), 50);
    const { results, tookMs } = await search({
      embedding,
      contains,
      topk: n,
      mode: m,
    });
    res.json({ results, tookMs, mode: m });
  } catch (e) {
    next(e);
  }
});

app.get("/api/docs", async (_req, res, next) => {
  try {
    const docCount = await getDocCount();
    res.json({ count: docCount });
  } catch (e) {
    next(e);
  }
});

app.get("/api/docs/:id", async (req, res, next) => {
  try {
    const doc = await getDoc(req.params.id);
    if (!doc) return res.status(404).json({ error: "not found" });
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

app.delete("/api/docs/:id", async (req, res, next) => {
  try {
    const result = await deleteDoc(req.params.id);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

app.post("/api/reset", async (_req, res, next) => {
  try {
    const result = await resetCollection();
    res.json(result);
  } catch (e) {
    next(e);
  }
});

// Model files for the browser embedder (fp16 for WebGPU, int8 for WASM)
app.use("/models", express.static(MODELS_DIR, { immutable: false }));

// Production: serve the built frontend
app.use(express.static(APP_DIST_DIR));
app.get(/^\/(?!api\/|models\/).*/, (_req, res) => {
  res.sendFile(path.join(APP_DIST_DIR, "index.html"), (err) => {
    if (err) res.status(200).send("stepfun server is running (no frontend build).");
  });
});

app.use((err, _req, res, _next) => {
  console.error("[server error]", err);
  res.status(500).json({ error: err?.message ?? String(err) });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[stepfun] server listening on http://0.0.0.0:${PORT}`);
  console.log(`[stepfun] data dir: ${config.dataDir}`);
  console.log(`[stepfun] models dir: ${MODELS_DIR}`);
});
