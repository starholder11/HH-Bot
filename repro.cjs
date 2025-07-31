const fs = require("node:fs");
const path = require("node:path");
const lancedb = require("@lancedb/lancedb");
const arrow = require("apache-arrow");

const DIM = 1536;
const TMP_DIR = path.join(process.cwd(), "tmp_lancedb_repro_cjs");
const TABLE = "documents_repro";

// Show which Arrow module(s) are loaded
function showArrowInfo() {
  try {
    const ours = require.resolve("apache-arrow");
    console.log("[arrow] resolved path:", ours);
  } catch (e) {
    console.log("[arrow] could not resolve from app:", e?.message);
  }

  try {
    // If lancedb hoists its own arrow, this path may exist; if deduped, it may not.
    const theirs = require.resolve("@lancedb/lancedb/node_modules/apache-arrow");
    console.log("[arrow] lancedb nested arrow path:", theirs);
  } catch {
    console.log("[arrow] lancedb nested arrow not found (likely deduped)");
  }

  console.log("[arrow] version (from package.json):",
    (() => {
      try {
        const fs = require("fs");
        const path = require("path");
        const pkgPath = path.join(require.resolve("apache-arrow"), "../package.json");
        return JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;
      } catch { return "unknown"; }
    })()
  );
}

function makeSchema() {
  return new arrow.Schema([
    new arrow.Field("id", new arrow.Utf8(), false),
    new arrow.Field("content_type", new arrow.Utf8(), false),
    new arrow.Field("title", new arrow.Utf8(), true),
    new arrow.Field("embedding", new arrow.FixedSizeList(DIM, new arrow.Field("item", new arrow.Float32(), false)), false),
    new arrow.Field("searchable_text", new arrow.Utf8(), true),
    new arrow.Field("content_hash", new arrow.Utf8(), true),
    new arrow.Field("references", new arrow.Utf8(), true),
  ]);
}

async function createEmptyTable(db) {
  const schema = makeSchema();

  // Try different table creation approaches
  try {
    // Approach 1: createEmptyTable with schema as second parameter
    console.log("Trying createEmptyTable with schema as second parameter...");
    return await db.createEmptyTable(TABLE, schema);
  } catch (error1) {
    console.log("Approach 1 failed:", error1.message);

    try {
      // Approach 2: createEmptyTable with options object
      console.log("Trying createEmptyTable with options object...");
      return await db.createEmptyTable(TABLE, { schema });
    } catch (error2) {
      console.log("Approach 2 failed:", error2.message);

      try {
        // Approach 3: createTable with empty data and schema
        console.log("Trying createTable with empty data and schema...");
        return await db.createTable(TABLE, [], { schema });
      } catch (error3) {
        console.log("Approach 3 failed:", error3.message);

        // Approach 4: createTable with initial data that matches schema
        console.log("Trying createTable with initial data that matches schema...");
        const initialData = [{
          id: "schema-test",
          content_type: "text",
          title: "Schema Test",
          embedding: Array.from(new Float32Array(DIM).fill(0.001)),
          searchable_text: "test",
          content_hash: "test",
          references: "{}"
        }];
        return await db.createTable(TABLE, initialData, { schema });
      }
    }
  }
}

async function schemaString(tbl) {
  const s = await tbl.schema();
  return s.toString();
}

function makeNumberVector(dim = DIM, val = 0.001) {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = val * (i + 1);
  return Array.from(v); // IMPORTANT: number[], not typed array
}

async function insertWithAdd(tbl) {
  const embedding = makeNumberVector(DIM, 0.002);

  // Debug the data being passed
  console.log("insertWithAdd - embedding type:", typeof embedding);
  console.log("insertWithAdd - embedding is array:", Array.isArray(embedding));
  console.log("insertWithAdd - embedding length:", embedding.length);
  console.log("insertWithAdd - embedding first 5:", embedding.slice(0, 5));

  const row = {
    id: "row-add-1",
    content_type: "text",
    title: "Add path",
    embedding: embedding,
    searchable_text: "test",
    content_hash: "h1",
    references: "{}",
  };

  // Debug the record being passed
  console.log("insertWithAdd - record embedding type:", typeof row.embedding);
  console.log("insertWithAdd - record embedding is array:", Array.isArray(row.embedding));
  console.log("insertWithAdd - record embedding length:", row.embedding.length);
  console.log("insertWithAdd - record embedding first 5:", row.embedding.slice(0, 5));

  await tbl.add([row]);
}

function buildFixedSizeListVector(rowsAsNumberArrays, dim) {
  const listType = new arrow.FixedSizeList(
    dim,
    new arrow.Field("item", new arrow.Float32(), false) // child field
  );
  const builder = arrow.Builder?.new
    ? arrow.Builder.new({ type: listType })
    : arrow.makeBuilder({ type: listType });

  for (const arr of rowsAsNumberArrays) {
    if (!Array.isArray(arr) || arr.length !== dim) throw new Error("Bad vector length");
    builder.append(arr); // arr must be number[] of exact dim
  }
  return builder.finish().toVector();
}

async function insertWithArrow(tbl) {
  const schema = await tbl.schema();

  // Build each column as an Arrow Vector
  const ids     = arrow.Vector.from(["row-arrow-1"]);
  const ctypes  = arrow.Vector.from(["text"]);
  const titles  = arrow.Vector.from(["Arrow path"]);
  const embeds  = buildFixedSizeListVector([makeNumberVector(DIM, 0.003)], DIM);
  const texts   = arrow.Vector.from(["test"]);
  const hashes  = arrow.Vector.from(["h2"]);
  const refs    = arrow.Vector.from(["{}"]);

  // ✅ pass the *schema object* (not just names)
  const table = arrow.Table.new([ids, ctypes, titles, embeds, texts, hashes, refs], schema);

  // Optional: sanity print
  console.log("embeds.type:", embeds.type?.toString?.());
  console.log("schema embedding type:", schema.fields.find(f=>f.name==="embedding").type.toString());

  if (typeof tbl.addArrow === "function") {
    await tbl.addArrow(table);
  } else {
    await tbl.addBatches([...table.batches]);
  }
}

(async () => {
  showArrowInfo();

  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const db = await lancedb.connect(TMP_DIR);
  const tbl = await createEmptyTable(db);

  console.log("\nSCHEMA right after create:\n", await schemaString(tbl));

  await insertWithAdd(tbl);
  console.log("\nSCHEMA after add():\n", await schemaString(tbl));

  await insertWithArrow(tbl);
  console.log("\nSCHEMA after addArrow/addBatches():\n", await schemaString(tbl));

  console.log("\nDone.");
})().catch(e => {
  console.error("REPRO ERROR:", e);
  process.exit(1);
});
