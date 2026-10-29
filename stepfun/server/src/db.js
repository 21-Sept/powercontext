/**
 * seekdb session manager (embedded mode, Linux).
 * Owns the SeekdbClient, the knowledge-base collection and session state.
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

export const VECTOR_DIM = 512; // BAAI/bge-small-zh-v1.5

const ENV = {
  dataDir: process.env.SEEKDB_DATA_DIR || path.join(__dirname, "..", "data"),
  // Embedded engine ships with pre-created databases "test" and "oceanbase";
  // connecting to any other name fails with "database is null".
  dbName: process.env.SEEKDB_DB_NAME || "test",
  collection: process.env.SEEKDB_COLLECTION || "kb_docs",
};

export const config = ENV;

/** Session state — everything the app needs to know about the running seekdb instance. */
export const session = {
  startedAt: null,
  client: null,
  collection: null,
  engineVersion: null,
  schema: null,
  lastImport: null, // { added, addMs, refreshMs, at }
  lastSearch: null, // { tookMs, at }
  initMs: null,
};

function buildSchema() {
  return new Schema({
    fulltextIndex: new FulltextIndexConfig("ik", { ik_mode: "smart" }),
    vectorIndex: new VectorIndexConfig({
      hnsw: {
        dimension: VECTOR_DIM,
        distance: "cosine",
        m: 16,
        ef_construction: 200,
      },
      embeddingFunction: null, // embeddings are computed in the browser
    }),
  });
}

export async function ensureSession() {
  if (session.collection) return session;
  const t0 = Date.now();
  const client = new SeekdbClient({ path: ENV.dataDir, database: ENV.dbName });
  const [versionRow] = await client.execute("SELECT VERSION() AS v");
  session.engineVersion = versionRow && versionRow.v;
  const schema = buildSchema();
  // SDK quirk: re-opening a collection created with embeddingFunction:null
  // via getOrCreateCollection throws "Embedding function 'default-embed' is
  // not registered". listCollections({withEmbeddingFunction:false}) skips the
  // default-ef resolution and restores the collection safely.
  const existing = await client.listCollections({ withEmbeddingFunction: false });
  let collection = existing.find((c) => c.name === ENV.collection);
  if (!collection) {
    collection = await client.getOrCreateCollection({
      name: ENV.collection,
      schema,
    });
  }
  session.client = client;
  session.collection = collection;
  session.schema = schema;
  session.startedAt = new Date().toISOString();
  session.initMs = Date.now() - t0;
  return session;
}

/**
 * Import documents with browser-computed embeddings, then refresh the index
 * so the new documents become searchable immediately.
 */
export async function importDocuments(items) {
  await ensureSession();
  const ids = items.map((it, i) => it.id ?? `doc-${Date.now()}-${i}`);
  const t0 = Date.now();
  await session.collection.add({
    ids,
    documents: items.map((it) => it.text),
    metadatas: items.map((it) => it.metadata ?? {}),
    embeddings: items.map((it) => it.embedding),
  });
  const addMs = Date.now() - t0;
  const t1 = Date.now();
  await session.collection.refresh_index();
  const refreshMs = Date.now() - t1;
  session.lastImport = {
    added: items.length,
    ids,
    addMs,
    refreshMs,
    at: new Date().toISOString(),
  };
  return { added: items.length, ids, addMs, refreshMs };
}

/**
 * Search executed fully inside seekdb.
 * mode "hybrid":   fulltext MATCH + HNSW KNN fused with RRF by DBMS_HYBRID_SEARCH
 * mode "vector":   HNSW KNN only (collection.query)
 * mode "fulltext": fulltext MATCH only (no knn / no rank)
 */
export async function search({ embedding, contains, topk = 10, mode = "hybrid" }) {
  await ensureSession();
  const t0 = Date.now();
  let res;
  if (mode === "vector") {
    res = await session.collection.query({
      queryEmbeddings: embedding,
      nResults: topk,
    });
  } else if (mode === "fulltext") {
    res = await session.collection.hybridSearch({
      query: { whereDocument: { $contains: contains }, nResults: topk },
      nResults: topk,
    });
  } else {
    res = await session.collection.hybridSearch({
      query: { whereDocument: { $contains: contains }, nResults: topk },
      knn: { queryEmbeddings: embedding, nResults: topk },
      rank: { rrf: {} },
      nResults: topk,
    });
  }
  const tookMs = Date.now() - t0;
  session.lastSearch = { mode, tookMs, at: new Date().toISOString() };

  const ids = res?.ids?.[0] ?? res?.ids ?? [];
  const docs = res?.documents?.[0] ?? res?.documents ?? [];
  const metas = res?.metadatas?.[0] ?? res?.metadatas ?? [];
  const dists = res?.distances?.[0] ?? res?.distances ?? [];

  const results = ids.map((id, i) => ({
    id: String(id),
    text: docs[i] != null ? String(docs[i]) : null,
    metadata: metas[i] ?? null,
    distance: dists[i] ?? null,
  }));
  return { results, tookMs };
}

export async function getDocCount() {
  await ensureSession();
  return session.collection.count();
}

export async function getDoc(id) {
  await ensureSession();
  const res = await session.collection.get({ ids: [id] });
  const docs = res?.documents?.[0] ?? res?.documents ?? [];
  const metas = res?.metadatas?.[0] ?? res?.metadatas ?? [];
  if (!docs || docs.length === 0 || docs[0] == null) return null;
  return {
    id: String(id),
    text: String(docs[0]),
    metadata: metas[0] ?? null,
  };
}

export async function deleteDoc(id) {
  await ensureSession();
  await session.collection.delete({ ids: [id] });
  const t0 = Date.now();
  await session.collection.refresh_index();
  return { deleted: 1, refreshMs: Date.now() - t0 };
}

export async function resetCollection() {
  await ensureSession();
  const name = ENV.collection;
  if (await session.client.hasCollection(name)) {
    await session.client.deleteCollection(name);
  }
  const schema = buildSchema();
  session.collection = await session.client.getOrCreateCollection({ name, schema });
  return { reset: true };
}

export function sessionInfo() {
  return {
    database: ENV.dbName,
    collection: ENV.collection,
    engineVersion: session.engineVersion,
    startedAt: session.startedAt,
    initMs: session.initMs,
    lastImport: session.lastImport,
    lastSearch: session.lastSearch,
  };
}
