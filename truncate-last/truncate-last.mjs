import { fileURLToPath } from 'node:url';

const TARGET_SURVEYS = [ 'ISOC_R_CI_IT_EN2', 'NAMA_10R_3EMPERS' ];

const FIELD = { survey: 'survey', dimensions: 'dimensions' };
const BATCH_SIZE = 5000;
const PAGE_SIZE = 5000;
const PROGRESS_EVERY = 50000;

const isYear = v => /^\d{4}$/.test(String(v).trim());


export function truncateAfterYear(dimensions) {
  if (!Array.isArray(dimensions) || dimensions.length < 2) {
    return { dimensions, truncated: false };
  }
  let yi = -1;
  for (let i = dimensions.length - 1; i >= 0; i--) {
    if (isYear(dimensions[i])) { yi = i; break; }
  }
  if (yi === -1) return { dimensions, truncated: false, reason: 'nessun anno a 4 cifre' };
  if (yi === dimensions.length - 1) return { dimensions, truncated: false }; // già ultimo
  return {
    dimensions: dimensions.slice(0, yi + 1),
    removed: dimensions.slice(yi + 1),
    truncated: true,
  };
}

export async function processSurvey(coll, survey, dryRun, ObjectId, onProgress) {
  const stats = { processed: 0, truncated: 0 };
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
      const res = truncateAfterYear(doc[FIELD.dimensions]);
      if (!res.truncated) continue;
      stats.truncated++;
      ops.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { [FIELD.dimensions]: res.dimensions, truncated: true } },
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
  r = truncateAfterYear(['geo', 'ind', 'nace', 'unit', 'freq', '2021', 'extraA', 'extraB']);
  A(r.truncated && eq(r.dimensions, ['geo', 'ind', 'nace', 'unit', 'freq', '2021']), 'taglia la coda dopo l\'anno (indice 5 -> ultimo)');
  A(eq(r.removed, ['extraA', 'extraB']), 'removed = coda tagliata');

  r = truncateAfterYear(['geo', '2021']);
  A(!r.truncated, 'anno già ultimo -> nessun taglio');

  r = truncateAfterYear(['a', 'b', 'c']);
  A(!r.truncated, 'nessun anno -> nessun taglio');

  r = truncateAfterYear(['geo', '2021', 'x']);
  A(r.truncated && eq(r.dimensions, ['geo', '2021']), 'anno a metà -> coda tagliata');

  const once = truncateAfterYear(['geo', '2021', 'x']).dimensions;
  A(!truncateAfterYear(once).truncated, 'idempotente (secondo giro non tocca)');

  console.log('\nSelf-test completato.');
}


async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--self-test')) return selfTest();

  const dryRun = args.has('--dry-run');
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:22000';
  const dbName = process.env.DB_NAME || 'query-engine';
  const collName = process.env.COLL || 'datapoints';

  const { MongoClient, ObjectId } = await import('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  const coll = client.db(dbName).collection(collName);

  const agg = { processed: 0, truncated: 0 };
  let processedGlobal = 0, nextProgress = PROGRESS_EVERY;
  const onProgress = delta => {
    processedGlobal += delta;
    if (processedGlobal >= nextProgress) {
      console.log(`  avanzamento: ${processedGlobal.toLocaleString()} elaborati...`);
      nextProgress += PROGRESS_EVERY;
    }
  };

  try {
    for (const survey of TARGET_SURVEYS) {
      const total = await coll.countDocuments({ [FIELD.survey]: survey });
      console.log(`— ${survey}: ${total.toLocaleString()} record...`);
      const stats = await processSurvey(coll, survey, dryRun, ObjectId, onProgress);
      agg.processed += stats.processed;
      agg.truncated += stats.truncated;
      console.log(`  ok ${survey}: ${stats.truncated.toLocaleString()} troncati${dryRun ? ' (dry-run)' : ''} su ${stats.processed.toLocaleString()}.`);
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
