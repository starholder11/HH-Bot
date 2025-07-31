const path = require("node:path");
const fs = require("node:fs");
const arrow = require("apache-arrow");
const lancedb = require("@lancedb/lancedb");

const DB_DIR = path.join(process.cwd(), "simple_test");
const TABLE = "test";

// Clean up
fs.rmSync(DB_DIR, { recursive: true, force: true });
fs.mkdirSync(DB_DIR, { recursive: true });

// Simple schema
const schema = new arrow.Schema([
  new arrow.Field("id", new arrow.Utf8(), false),
  new arrow.Field("value", new arrow.Float32(), false),
]);

(async () => {
  const db = await lancedb.connect(DB_DIR);
  console.log("Connected to LanceDB");

  const tbl = await db.createEmptyTable(TABLE, schema);
  console.log("Created table");
  console.log("Table methods:", Object.getOwnPropertyNames(tbl).filter(k => typeof tbl[k] === "function"));

  // Try simple add
  await tbl.add([{ id: "test1", value: 1.0 }]);
  console.log("Added record successfully");

  const count = await tbl.countRows();
  console.log("Row count:", count);

  const s = await tbl.schema();
  console.log("Schema:", s.toString());
})().catch(e => {
  console.error("ERROR:", e);
  process.exit(1);
});
