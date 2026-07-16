import { fileURLToPath } from 'node:url';

const SURVEY = 'PAT_EP_TOT';
const FIELD = { survey: 'survey', dimensions: 'dimensions' };

export function swap03(dims) {
  if (!Array.isArray(dims) || dims.length < 4) return dims;
  const out = dims.slice();
  [out[0], out[3]] = [out[3], out[0]];
  return out;
}

const filter = {
  [FIELD.survey]: SURVEY,
  patSwapped: { $ne: true },
  $expr: { $gte: [{ $size: `$${FIELD.dimensions}` }, 4] },
};

const updatePipeline = [
  {
    $set: {
      [FIELD.dimensions]: {
        $concatArrays: [
          [{ $arrayElemAt: [`$${FIELD.dimensions}`, 3] }],
          { $slice: [`$${FIELD.dimensions}`, 1, 2] },
          [{ $arrayElemAt: [`$${FIELD.dimensions}`, 0] }],
          { $slice: [`$${FIELD.dimensions}`, 4, { $size: `$${FIELD.dimensions}` }] },
        ],
      },
      patSwapped: true,
    },
  },
];

function selfTest() {
  const A = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok', m); };
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  A(eq(swap03(['a', 'b', 'c', 'd']), ['d', 'b', 'c', 'a']), 'len 4: [0]<->[3]');
  A(eq(swap03(['a', 'b', 'c', 'd', 'e']), ['d', 'b', 'c', 'a', 'e']), 'len 5: coda invariata');
  A(eq(swap03(['a', 'b', 'c']), ['a', 'b', 'c']), 'len < 4: invariato');
  A(eq(swap03(swap03(['a', 'b', 'c', 'd'])), ['a', 'b', 'c', 'd']), 'doppio swap ripristina (per questo serve il flag)');
  console.log('\nSelf-test completato.');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--self-test')) return selfTest();

  const dryRun = args.has('--dry-run');
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:22000';
  const dbName = process.env.DB_NAME || 'query-engine';
  const collName = process.env.COLL || 'datapoints';

  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  const coll = client.db(dbName).collection(collName);

  try {
    const toDo = await coll.countDocuments(filter);
    console.log(`${SURVEY}: ${toDo.toLocaleString()} documenti da swappare (0<->3).`);
    if (dryRun) {
      console.log('(dry-run: nessuna scrittura effettuata)');
      return;
    }
    const res = await coll.updateMany(filter, updatePipeline);
    console.log(`matched: ${res.matchedCount}, modified: ${res.modifiedCount}`);
  } finally {
    await client.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => { console.error(err); process.exit(1); });
}
