/**
 * Startup smoke test: verifies engine DDL + DML + hybrid search all work
 * before the server starts serving. Exits non-zero on any failure.
 */
import {
  SeekdbClient,
  Schema,
  FulltextIndexConfig,
  VectorIndexConfig,
} from "seekdb";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.SEEKDB_DATA_DIR || path.join(__dirname, "..", "data");

const client = new SeekdbClient({ path: dataDir, database: "test" });
const t0 = Date.now();

const [versionRow] = await client.execute("SELECT VERSION() AS v");
console.log(`[health] engine ${versionRow?.v} (${Date.now() - t0}ms to connect)`);

const schema = new Schema({
  fulltextIndex: new FulltextIndexConfig("ik", { ik_mode: "smart" }),
  vectorIndex: new VectorIndexConfig({
    hnsw: { dimension: 384, distance: "cosine", m: 16, ef_construction: 200 },
    embeddingFunction: null,
  }),
});

const existing = await client.listCollections({ withEmbeddingFunction: false });
let coll = existing.find((c) => c.name === "kb_docs");
if (!coll) {
  coll = await client.getOrCreateCollection({ name: "kb_docs", schema });
}
console.log("[health] collection ready");

const emb = (i) => Array.from({ length: 384 }, (_, k) => Math.sin(i + k * 0.01));
const probeId = `probe-${Date.now()}`;
await coll.add({
  ids: [probeId],
  documents: ["健康检查文档：seekdb 混合检索冒烟测试"],
  metadatas: [{ probe: true }],
  embeddings: [emb(1)],
});
await coll.refresh_index();

const res = await coll.hybridSearch({
  query: { whereDocument: { $contains: "混合检索" }, nResults: 3 },
  knn: { queryEmbeddings: emb(1), nResults: 3 },
  rank: { rrf: {} },
  nResults: 3,
});
const ids = res?.ids?.[0] ?? res?.ids ?? [];
if (!ids.includes(probeId)) {
  throw new Error(`probe document not found in hybrid search results: ${JSON.stringify(ids)}`);
}
const count = await coll.count();
console.log(`[health] hybrid search OK (docCount=${count})`);
await coll.delete({ ids: [probeId] });
await coll.refresh_index();
console.log("[health] DML (insert/delete) + refresh OK — all checks passed");
process.exit(0);
