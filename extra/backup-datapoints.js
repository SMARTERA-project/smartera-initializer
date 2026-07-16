const { MongoClient } = require("mongodb");
const fs = require("fs");

const uri = "mongodb://localhost:22000";
const dbName = "query-engine"; 

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const collections = await db.listCollections().toArray();
  const targetNames = collections
    .map(c => c.name)
    .filter(name => name.startsWith("cached"));

  let allDocs = [];

  for (const name of targetNames) {
    const docs = await db.collection(name)
      .find({}, { projection: { _id: 0 } })
      .toArray();
    allDocs = allDocs.concat(docs);
  }

  fs.writeFileSync("datapoints.json", JSON.stringify(allDocs, null, 2));
  console.log(`Esportati ${allDocs.length} documenti da ${targetNames.length} collection.`);

  await client.close();
}

main().catch(console.error);