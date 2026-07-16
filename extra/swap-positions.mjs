import { fileURLToPath } from 'node:url';

const SURVEY = 'CENS_21CTZ_R3';
const I = 3;
const J = 5;               // I < J
const MARKER = 'ctzSwapped';

const FIELD = { survey: 'survey', dimensions: 'dimensions' };
const D = `$${FIELD.dimensions}`;

export function swapIJ(arr, i, j) {
  if (!Array.isArray(arr) || arr.length <= j) return arr;
  const out = arr.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

const filter = {
  [FIELD.survey]: SURVEY,
  [MARKER]: { $ne: true },
  $expr: { $gte: [{ $size: D }, J + 1] },
};

const updatePipeline = [
  {
    $set: {
      [FIELD.dimensions]: {
        $concatArrays: [
          { $slice: [D, 0, I] },
          [{ $arrayElemAt: [D, J] }],
          { $slice: [D, I + 1, J - I - 1] },
          [{ $arrayElemAt: [D, I] }],
          { $slice: [D, J + 1, { $size: D }] },
        ],
      },
      [MARKER]: true,
    },
  },
];

function selfTest() {
  const A = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok', m); };
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  A(eq(swapIJ(['a', 'b', 'c', 'd', 'e', 'f'], 3, 5), ['a', 'b', 'c', 'f', 'e', 'd']), '3<->5, indice 4 invariato');
  A(eq(swapIJ(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 3, 5), ['a', 'b', 'c', 'f', 'e', 'd', 'g']), 'coda (6) invariata');
  A(eq(swapIJ(['a', 'b', 'c', 'd', 'e'], 3, 5), ['a', 'b', 'c', 'd', 'e']), 'len <= J: invariato');
  A(eq(swapIJ(swapIJ(['a', 'b', 'c', 'd', 'e', 'f'], 3, 5), 3, 5), ['a', 'b', 'c', 'd', 'e', 'f']), 'doppio swap ripristina (per questo serve il flag)');
  console.log('\nSelf-test completato.');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--self-test')) return selfTest();
  if (I >= J) { console.error('Config errata: serve I < J'); process.exit(1); }

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
    console.log(`${SURVEY}: ${toDo.toLocaleString()} documenti da swappare (${I}<->${J}).`);
    if (dryRun) { console.log('(dry-run: nessuna scrittura effettuata)'); return; }
    const res = await coll.updateMany(filter, updatePipeline);
    console.log(`matched: ${res.matchedCount}, modified: ${res.modifiedCount}`);
  } finally {
    await client.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => { console.error(err); process.exit(1); });
}
