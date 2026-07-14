const { MongoClient } = require('mongodb');

let surveysToIgnore
try {
  surveysToIgnore = require('./surveys-to-ignore.json');
  if (!Array.isArray(surveysToIgnore)) {
    throw new Error('surveys-to-ignore.json non è un array.');
  }
  surveysToIgnore = surveysToIgnore.map((s) => s.toUpperCase());
}
catch (err) {
  console.error('Errore durante il caricamento di surveys-to-ignore.json:', err);
  console.warn('nessuna survey ignorata.');
  surveysToIgnore = [];
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:22000';
const DB_NAME = process.env.DB_NAME || 'Minio-Mongo';
const COLL_NAME = process.env.COLL_NAME || 'datapoints';

const client = new MongoClient(MONGO_URI);

async function main() {
  await client.connect();
  const db = client.db(DB_NAME);
  const collection = db.collection(COLL_NAME);

  const surveyNames = await collection.distinct('surveyName');
  //console.log(await collection.countDocuments(), `documenti nella collezione "${COLL_NAME}".`);
  console.log(`Trovati ${surveyNames.length} nomi di survey unici nella collezione "${COLL_NAME}".`);

  const toUppercase = surveyNames
    .filter((s) => typeof s === 'string')
    .filter((s) => s !== s.toUpperCase())
    .filter((s) => !surveysToIgnore.includes(s.toUpperCase()));

  console.log(`${toUppercase.length} survey da normalizzare in uppercase.`);

  for (const name of toUppercase) {
    const upper = name.toUpperCase();
    const result = await collection.updateMany(
      { survey: { $exists: false }, surveyName: name },
      { $set: { survey: upper } }
    );
    console.log(`[diretto] "${name}" -> "${upper}": ${result.modifiedCount} documenti aggiornati`);

  }

  await client.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
