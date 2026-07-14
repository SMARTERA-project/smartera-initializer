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

const EXCLUDED_FIELDS = ['_id', 'survey', 'timestamp'];

const client = new MongoClient(MONGO_URI);

function stripExcluded(doc) {
  const copy = { ...doc };
  for (const field of EXCLUDED_FIELDS) delete copy[field];
  return copy;
}

async function main() {
  await client.connect();
  const db = client.db(DB_NAME);
  const collection = db.collection(COLL_NAME);

  const surveys = await collection.distinct('survey');
  //console.log(await collection.countDocuments(), `documenti nella collezione "${COLL_NAME}".`);
  console.log(`Trovati ${surveys.length} survey unici nella collezione "${COLL_NAME}".`);
  const toUppercase = surveys
    .filter((s) => typeof s === 'string')
    .filter((s) => s !== s.toUpperCase())
    .filter((s) => !surveysToIgnore.includes(s.toUpperCase()));

  console.log(`${toUppercase.length} survey da normalizzare in uppercase.`);

  for (const lower of toUppercase) {
    const upper = lower.toUpperCase();
    const upperExists =
      (await collection.findOne({ survey: upper }, { projection: { _id: 1 } })) !== null;

    if (!upperExists) {
      const result = await collection.updateMany(
        { survey: lower },
        { $set: { survey: upper } }
      );
      console.log(`[diretto] "${lower}" -> "${upper}": ${result.modifiedCount} documenti aggiornati`);
      continue;
    }

    console.log(`[conflitto] "${lower}" -> "${upper}": il gruppo esiste già, verifico i doppioni...`);

    const ids = await collection
      .find({ survey: lower }, { projection: { _id: 1 } })
      .map((d) => d._id)
      .toArray();

    let deletedDuplicates = 0;
    let promoted = 0;

    for (const id of ids) {
      const doc = await collection.findOne({ _id: id });
      if (!doc) continue;

      const filter = { survey: upper, ...stripExcluded(doc) };
      const existing = await collection.findOne(filter, { projection: { _id: 1 } });

      if (existing) {
        //await collection.updateOne({ _id: existing._id }, { $set: { timestamp: new Date() } });
        await collection.deleteOne({ _id: doc._id });
        deletedDuplicates += 1;
      } else {
        await collection.updateOne({ _id: doc._id }, { $set: { survey: upper } });
        promoted += 1;
      }
    }

    console.log(`  Risultato: ${promoted} promossi, ${deletedDuplicates} duplicati rimossi.`);
  }

  await client.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
