// ingest.cjs
const path = require("node:path");
const fs = require("node:fs");
const arrow = require("apache-arrow");
const lancedb = require("@lancedb/lancedb");

const DIM = 1536;
const DB_DIR = path.join(process.cwd(), "db_ok");
const TABLE = "documents_v1";

fs.rmSync(DB_DIR, { recursive: true, force: true });
fs.mkdirSync(DB_DIR, { recursive: true });

const schema = new arrow.Schema([
  new arrow.Field("id", new arrow.Utf8(), false),
  new arrow.Field("content_type", new arrow.Utf8(), false),
  new arrow.Field("title", new arrow.Utf8(), true),
  new arrow.Field(
    "embedding",
    new arrow.FixedSizeList(DIM, new arrow.Field("item", new arrow.Float32(), false)),
    false
  ),
  new arrow.Field("searchable_text", new arrow.Utf8(), true),
  new arrow.Field("content_hash", new arrow.Utf8(), true),
  new arrow.Field("references", new arrow.Utf8(), true),
]);

function makeNumVector(dim, k) {
  const f32 = new Float32Array(dim);
  for (let i = 0; i < dim; i++) f32[i] = (k + 1) * 0.001 * (i + 1);
  return Array.from(f32); // IMPORTANT: number[], not a typed array object
}

function buildFixedSizeListVector(rowsAsNumberArrays, dim) {
  const type = new arrow.FixedSizeList(dim, new arrow.Field("item", new arrow.Float32(), false));
  const builder = arrow.Builder?.new
    ? arrow.Builder.new({ type })
    : arrow.makeBuilder({ type });
  for (const arr of rowsAsNumberArrays) {
    if (!Array.isArray(arr) || arr.length !== dim) throw new Error("embedding must be number[] of exact length");
    builder.append(arr);
  }
  return builder.finish().toVector();
}

(async () => {
  const db = await lancedb.connect(DB_DIR);

  // Create table EMPTY with explicit schema
  const tbl = (typeof db.createEmptyTable === "function")
    ? await db.createEmptyTable(TABLE, schema)
    : await db.createTable(TABLE, [], { schema });

  const printSchema = async (label) => {
    const s = await tbl.schema();
    console.log(`\n=== ${label} ===\n${s.toString()}`);
  };
  await printSchema("after create");

  // Build columns in the EXACT schema order
  const ids     = arrow.vectorFromArray(["row-1"]);
  const ctypes  = arrow.vectorFromArray(["text"]);
  const titles  = arrow.vectorFromArray(["Arrow batch path"]);
  const embeds  = buildFixedSizeListVector([makeNumVector(DIM, 0)], DIM);
  const texts   = arrow.vectorFromArray(["hello"]);
  const hashes  = arrow.vectorFromArray(["h1"]);
  const refs    = arrow.vectorFromArray(["{}"]);

  // Sanity: types must match
  console.log("embed vector type:", embeds.type?.toString?.());
  console.log("schema embedding type:", schema.fields.find(f => f.name === "embedding").type.toString());

  // Build Arrow Table WITH THE SCHEMA OBJECT (not names)
  const table = arrow.makeTable([ids, ctypes, titles, embeds, texts, hashes, refs], schema);

  // Since Arrow batch methods aren't available, try tbl.add with plain objects
  // This is a workaround - the schema should be enforced by the table creation
  const record = {
    id: "row-1",
    content_type: "text",
    title: "Arrow batch path",
    embedding: makeNumVector(DIM, 0), // Plain number[]
    searchable_text: "hello",
    content_hash: "h1",
    references: "{}"
  };

  // Verify the data format
  console.log("Array.isArray(embedding):", Array.isArray(record.embedding));
  console.log("typeof embedding[0]:", typeof record.embedding[0]);
  console.log("embedding.length:", record.embedding.length);

  await tbl.add([record]);

  await printSchema("after first Arrow insert"); // must still be fixed_size_list<float32>[1536] not null
  console.log("\nRows:", await tbl.countRows());
})().catch(e => {
  console.error("INGEST ERROR:", e);
  process.exit(1);
});
