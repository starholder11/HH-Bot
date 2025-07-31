// repro.js
const fs = require("node:fs");
const path = require("node:path");
const arrow = require("apache-arrow");
const lancedb = require("@lancedb/lancedb");

const DIM = 1536;
const TMP_DIR = path.join(process.cwd(), "tmp_lancedb_repro");
const TABLE = "documents_repro";

// Clean db dir
fs.rmSync(TMP_DIR, { recursive: true, force: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

function makeVector(dim = DIM, val = 0.001) {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = val * (i + 1);
  // Important: for add([...]) path, pass PLAIN number[]
  return Array.from(v);
}

function makeSchema() {
  const vectorType = new arrow.FixedSizeList(
    DIM,
    new arrow.Field("item", new arrow.Float32(), false)
  );
  return new arrow.Schema([
    new arrow.Field("id", new arrow.Utf8(), false),
    new arrow.Field("content_type", new arrow.Utf8(), false),
    new arrow.Field("title", new arrow.Utf8(), true),
    new arrow.Field("embedding", vectorType, false),
    new arrow.Field("searchable_text", new arrow.Utf8(), true),
    new arrow.Field("content_hash", new arrow.Utf8(), true),
    new arrow.Field("references", new arrow.Utf8(), true),
  ]);
}

async function createTable(db) {
  const schema = makeSchema();
  try {
    return await db.createEmptyTable(TABLE, schema);
  } catch (error) {
    console.log("Table creation failed, trying to open existing:", error.message);
    return await db.openTable(TABLE);
  }
}

async function schemaString(tbl) {
  const s = await tbl.schema();
  return s.toString();
}

// ---- Path A: add() with number[] ----
async function insertWithAdd(tbl) {
  const row = {
    id: "row-add-1",
    content_type: "text",
    title: "Add path",
    embedding: makeVector(DIM, 0.002), // PLAIN number[]
    searchable_text: "test",
    content_hash: "h1",
    references: "{}",
  };
  await tbl.add([row]);
}

// ---- Path B: explicit Arrow Table with FixedSizeList<Float32> ----
function buildFixedSizeListVector(rowsAsNumberArrays) {
  const listType = new arrow.FixedSizeList(
    DIM,
    new arrow.Field("item", new arrow.Float32(), false)
  );
  // Newer Arrow: makeBuilder; older: Builder.new
  const builder =
    arrow.makeBuilder?.({ type: listType }) ??
    arrow.Builder.new({ type: listType });

  for (const arr of rowsAsNumberArrays) {
    if (!Array.isArray(arr) || arr.length !== DIM) {
      throw new Error("Bad vector length");
    }
    builder.append(arr); // arr MUST be number[], length DIM
  }
  const vector = builder.finish().toVector();
  return vector;
}

async function insertWithArrow(tbl) {
  const schema = await tbl.schema();

  // Build columns as Arrow vectors matching the creation schema order:
  // ["id","content_type","title","embedding","searchable_text","content_hash","references"]
  const ids = arrow.Vector.from(["row-arrow-1"]);
  const ctypes = arrow.Vector.from(["text"]);
  const titles = arrow.Vector.from(["Arrow path"]);
  const embeddings = buildFixedSizeListVector([makeVector(DIM, 0.003)]);
  const texts = arrow.Vector.from(["test"]);
  const hashes = arrow.Vector.from(["h2"]);
  const refs = arrow.Vector.from(["{}"]);

  const table = arrow.Table.new(
    [ids, ctypes, titles, embeddings, texts, hashes, refs],
    schema.fields.map(f => f.name)
  );

  // Prefer addArrow if available; otherwise addBatches
  if (typeof tbl.addArrow === "function") {
    await tbl.addArrow(table);
  } else {
    const batches = [...table.batches];
    await tbl.addBatches(batches);
  }
}

(async () => {
  const db = await lancedb.connect(TMP_DIR);
  const tbl = await createTable(db);

  console.log("SCHEMA right after create:\n", await schemaString(tbl));

  await insertWithAdd(tbl);
  console.log("\nSCHEMA after add():\n", await schemaString(tbl));

  await insertWithArrow(tbl);
  console.log("\nSCHEMA after addArrow/addBatches():\n", await schemaString(tbl));

  console.log("\nDone.");
})().catch(e => {
  console.error(e);
  process.exit(1);
});
