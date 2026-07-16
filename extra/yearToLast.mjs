import { fileURLToPath } from 'node:url';
import { SURVEYS_TO_ORDER } from './reorder-dimensions.mjs';

const FIELD = { survey: 'survey', dimensions: 'dimensions' };
const BATCH_SIZE = 1000;
const PAGE_SIZE = 5000;
const PROGRESS_EVERY = 50000;

const isNum = v => {
  const s = String(v).trim();
  return s !== '' && Number.isFinite(Number(s));
};

export function moveYearToLast(dimensions) {
  if (!Array.isArray(dimensions) || dimensions.length < 2) {
    return { dimensions, changed: false };
  }
  const n = dimensions.length;

  if (isNum(dimensions[n - 1])) return { dimensions, changed: false };

  const j = dimensions.findIndex(d => String(d).length === 4 && isNum(d));
  if (j === -1 || j === n - 1) return { dimensions, changed: false };

  const out = dimensions.slice();
  [out[j], out[n - 1]] = [out[n - 1], out[j]];
  return { dimensions: out, changed: true };
}

export async function processSurvey(coll, survey, dryRun, ObjectId, onProgress) {
  const stats = { processed: 0, changed: 0 };
  let lastId = null;
  let ops = [];
  const flush = async () => {
    if (!ops.length) return;
    if (!dryRun) await coll.bulkWrite(ops, { ordered: false });
    ops = [];
  };

  while (true) {
    const q = { [FIELD.survey]: survey };
    if (lastId) q._id = { $gt: lastId };
    const page = await coll.find(q).sort({ _id: 1 }).limit(PAGE_SIZE).toArray();
    if (page.length === 0) break;

    for (const doc of page) {
      lastId = doc._id;
      stats.processed++;
      const res = moveYearToLast(doc[FIELD.dimensions]);
      if (!res.changed) continue;
      stats.changed++;
      ops.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { [FIELD.dimensions]: res.dimensions } },
        },
      });
      if (ops.length >= BATCH_SIZE) await flush();
    }
    await flush();
    if (onProgress) onProgress(page.length);
  }
  return stats;
}

function selfTest() {
  const A = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok', m); };
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  let r;
  r = moveYearToLast(['Annual', 'Males', '2021', 'Total']);
  A(r.changed && eq(r.dimensions, ['Annual', 'Males', 'Total', '2021']), 'anno spostato in fondo');

  r = moveYearToLast(['Males', '2021']);
  A(!r.changed, 'ultima già numerica -> nessun cambiamento');

  r = moveYearToLast(['A', 'B', 'C']);
  A(!r.changed, 'nessun anno -> nessun cambiamento');

  r = moveYearToLast(['Annual', 'Males', '12', 'Total']);
  A(!r.changed, 'numero non a 4 cifre -> nessun cambiamento');

  r = moveYearToLast(['2021', 'Annual']);
  A(r.changed && eq(r.dimensions, ['Annual', '2021']), 'anno in testa -> spostato in fondo');

  r = moveYearToLast(['Total']);
  A(!r.changed, 'array troppo corto -> nessun cambiamento');

  console.log('\nSelf-test completato.');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--self-test')) return selfTest();

  const dryRun = args.has('--dry-run');
  const uri = process.env.MONGODB_URI || "mongodb://localhost:22000";
  const dbName = process.env.DB_NAME || "query-engine";
  const collName = process.env.COLL || 'datapoints';
  if (!uri || !dbName) {
    console.error('Imposta MONGODB_URI e DB_NAME (e opzionalmente COLL).');
    process.exit(1);
  }

  const { MongoClient, ObjectId } = await import('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  const coll = client.db(dbName).collection(collName);

  //const excluded = new Set(SURVEYS_TO_ORDER); 
  const allSurveys = await coll.distinct(FIELD.survey);
  const targets = allSurveys//.filter(s => s != null && !excluded.has(s));

  console.log(`Survey totali: ${allSurveys.length}, da elaborare: ${targets.length}\n`);

  const agg = { total: 0, changed: 0 };
  let processedGlobal = 0, nextProgress = PROGRESS_EVERY;
  const onProgress = delta => {
    processedGlobal += delta;
    if (processedGlobal >= nextProgress) {
      console.log(`  avanzamento: ${processedGlobal.toLocaleString()} elaborati...`);
      nextProgress += PROGRESS_EVERY;
    }
  };

  try {
    for (const survey of targets) {
      const total = await coll.countDocuments({ [FIELD.survey]: survey });
      console.log(`— ${survey}: ${total.toLocaleString()} record...`);
      const stats = await processSurvey(coll, survey, dryRun, ObjectId, onProgress);
      agg.total += stats.processed;
      agg.changed += stats.changed;
      console.log(`  ok ${survey}: ${stats.changed.toLocaleString()} modificati${dryRun ? ' (dry-run)' : ''} su ${stats.processed.toLocaleString()}.`);
    }
  } finally {
    await client.close();
  }

  console.log('\n──────── RIEPILOGO ────────');
  console.log(agg);
  if (dryRun) console.log('\n(dry-run: nessuna scrittura effettuata)');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => { console.error(err); process.exit(1); });
}
