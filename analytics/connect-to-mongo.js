const { MongoClient } = require("mongodb");

let client;

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function getCollection(collectionName, uri, dbName) {
  if(!uri) 
    uri = await askQuestion("URI di connessione MongoDB (es. mongodb://localhost:27037): ");
  if(!dbName) 
    dbName = await askQuestion("Nome del database: ");

  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
    console.log("Connesso a MongoDB:", uri);
  }

  const db = client.db(dbName);
  return db.collection(collectionName);
}

async function closeConnection() {
  if (client) {
    await client.close();
    client = null;
    console.log("Connessione MongoDB chiusa.");
  }
}

async function example() {
  const datapoints = await getCollection("datapoints");

  const docs = await datapoints.find({}).limit(10).toArray();
  console.log(docs);

  await closeConnection();
}

module.exports = { getCollection, closeConnection, example };