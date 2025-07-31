const path = require("node:path");
const fs = require("node:fs");
const arrow = require("apache-arrow");
const lancedb = require("@lancedb/lancedb");

const DIM = 1536;
const DB_DIR = path.join(process.cwd(), "test_fix");
const TABLE = "test";

// Clean up
fs.rmSync(DB_DIR, { recursive: true, force: true });
fs.mkdirSync(DB_DIR, { recursive: true });

// Schema matching the service
const schema = new arrow.Schema([
  new arrow.Field("id", new arrow.Utf8(), false),
  new arrow.Field("content_type", new arrow.Utf8(), false),
  new arrow.Field("title", new arrow.Utf8(), true),
  new arrow.Field(
    "embedding",
    new arrow.FixedSizeList(
      DIM,
      new arrow.Field("item", new arrow.Float32(), false)
    ),
    false
  ),
  new arrow.Field("searchable_text", new arrow.Utf8(), true),
  new arrow.Field("content_hash", new arrow.Utf8(), true),
  new arrow.Field("references", new arrow.Utf8(), true),
]);

function makeNumVector(dim, k) {
  const f32 = new Float32Array(dim);
  for (let i = 0; i < dim; i++) f32[i] = (k + 1) * 0.001 * (i + 1);
  return Array.from(f32);
}

function buildFixedSizeListVector(rowsAsNumberArrays, dim) {
  const type = new arrow.FixedSizeList(
    dim,
    new arrow.Field("item", new arrow.Float32(), false)
  );
  const builder = arrow.Builder?.new
    ? arrow.Builder.new({ type })
    : arrow.makeBuilder({ type });
  for (const arr of rowsAsNumberArrays) {
    if (!Array.isArray(arr) || arr.length !== dim) {
      throw new Error("embedding must be number[] of exact length");
    }
    builder.append(arr);
  }
  return builder.finish().toVector();
}

(async () => {
  const db = await lancedb.connect(DB_DIR);
  console.log("Connected to LanceDB");

  const tbl = await db.createEmptyTable(TABLE, schema);
  console.log("Created table with schema");

  // Build Arrow vectors in schema order: [id, content_type, title, embedding, searchable_text, content_hash, references]
  const ids = arrow.vectorFromArray(["test1"]);
  const ctypes = arrow.vectorFromArray(["text"]);
  const titles = arrow.vectorFromArray(["Test"]);
  const embeds = buildFixedSizeListVector([makeNumVector(DIM, 0)], DIM);
  const texts = arrow.vectorFromArray(["test"]);
  const hashes = arrow.vectorFromArray(["h1"]);
  const refs = arrow.vectorFromArray(["{}"]);

  console.log("embed vector type:", embeds.type?.toString?.());
  console.log("schema embedding type:", schema.fields.find(f => f.name === "embedding").type.toString());
  console.log("Schema field names:", schema.fields.map(f => f.name));

    // Get the table's actual schema
  const tableSchema = await tbl.schema();
  console.log("Table schema:", tableSchema.toString());

    // Try using tbl.add with vectorColumn option to specify the embedding column
  const record = {
    id: "test1",
    content_type: "text",
    title: "Test",
    embedding: makeNumVector(DIM, 0),
    searchable_text: "test",
    content_hash: "h1",
    references: "{}"
  };

  // Try with vectorColumn option
  await tbl.add([record], { vectorColumn: "embedding" });
  console.log("✅ Added record successfully");

  const count = await tbl.countRows();
  console.log("Row count:", count);

  const s = await tbl.schema();
  console.log("Final schema:", s.toString());
})().catch(e => {
  console.error("ERROR:", e);
  process.exit(1);
});
