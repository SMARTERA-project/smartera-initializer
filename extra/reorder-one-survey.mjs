import { fileURLToPath } from 'node:url';
import { reorderDimensions, POSITION_CONFIG } from './reorder-dimensions.mjs';

const SURVEY = 'CENS_21CTZ_R3';
const CAT = { citizenship: 'citizen', ctz_sex: 'sex' };

const CFG = POSITION_CONFIG[SURVEY];
const FIELD = { survey: 'survey', dimensions: 'dimensions', obsHR: 'obsHR' };
const BATCH_SIZE = 5000;
const PAGE_SIZE = 5000;
const PROGRESS_EVERY = 50000;

export async function processSurvey(coll, dryRun, onProgress) {
  const stats = { processed: 0, changed: 0, skipped: 0 };
  const skipSamples = [];
  let lastId = null;
  let ops = [];
  const flush = async () => {
    if (!ops.length) return;
    if (!dryRun) await coll.bulkWrite(ops, { ordered: false });
    ops = [];
  };

  while (true) {
    const q = { [FIELD.survey]: SURVEY };
    if (lastId) q._id = { $gt: lastId };
    const page = await coll.find(q).sort({ _id: 1 }).limit(PAGE_SIZE).toArray();
    if (page.length === 0) break;

    for (const doc of page) {
      lastId = doc._id;
      stats.processed++;
      const res = reorderDimensions(doc[FIELD.dimensions], doc[FIELD.obsHR], CFG, CAT);
      if (res.skipped) {
        stats.skipped++;
        if (skipSamples.length < 20) skipSamples.push(`_id=${doc._id}: ${res.reason}`);
        continue;
      }
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
  return { stats, skipSamples };
}

function selfTest() {
  const A = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok', m); };

  const dims = ['Number', 'Andorra', 'Oberkärnten', 'Annual', 'Females', 'Total', '2021'];
  const obsHR = {
    geo: 'Oberkärnten', citizen: 'Andorra', unit: 'Number', sex: 'Females',
    freq: 'Annual', age: 'Total', time_period: '2021',
  };
  const r = reorderDimensions(dims, obsHR, CFG, CAT);
  A(!r.skipped, `riordino eseguito (${r.reason || 'ok'})`);
  A(r.dimensions[1] === 'Andorra', '[1] = cittadinanza');
  A(r.dimensions[3] === 'Females', '[3] = sesso (filterBy)');
  A([...r.dimensions].sort().join() === [...dims].sort().join(), 'nessuna label persa');
  A(r.dimensions.length === dims.length, 'lunghezza invariata');
  console.log('\nSelf-test completato.');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--self-test')) return selfTest();
  if (!CFG) { console.error(`Nessun POSITION_CONFIG per ${SURVEY}`); process.exit(1); }

  const dryRun = args.has('--dry-run');
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:22000';
  const dbName = process.env.DB_NAME || 'query-engine';
  const collName = process.env.COLL || 'datapoints';

  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  const coll = client.db(dbName).collection(collName);

  try {
    const total = await coll.countDocuments({ [FIELD.survey]: SURVEY });
    console.log(`${SURVEY}: ${total.toLocaleString()} record...`);
    let processedGlobal = 0, nextProgress = PROGRESS_EVERY;
    const onProgress = d => {
      processedGlobal += d;
      if (processedGlobal >= nextProgress) {
        console.log(`  avanzamento: ${processedGlobal.toLocaleString()}...`);
        nextProgress += PROGRESS_EVERY;
      }
    };
    const { stats, skipSamples } = await processSurvey(coll, dryRun, onProgress);
    console.log(`\nRIEPILOGO ${SURVEY}:`, stats, dryRun ? '(dry-run)' : '');
    if (skipSamples.length) { console.log('Esempi saltati:'); console.log(skipSamples.join('\n')); }
  } finally {
    await client.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => { console.error(err); process.exit(1); });
}
