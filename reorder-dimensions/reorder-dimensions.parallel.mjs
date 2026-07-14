import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { reorderDimensions, POSITION_CONFIG, SURVEYS_TO_ORDER } from './reorder-dimensions.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FIELD = { survey: 'survey', dimensions: 'dimensions', obsHR: 'obsHR' };
const BATCH_SIZE = 1000;       
const PAGE_SIZE = 5000;        
const RANGE_TARGET = 250000;  
const PROGRESS_EVERY = 100000;

export async function computeRanges(coll, survey, k) {
  if (k <= 1) return [{ loHex: null, hiHex: null }];
  const sampleSize = Math.max(2000, k * 20);
  const sampled = await coll
    .aggregate(
      [{ $match: { [FIELD.survey]: survey } }, { $sample: { size: sampleSize } }, { $project: { _id: 1 } }],
      { allowDiskUse: true }
    )
    .toArray();
  sampled.sort((a, b) => {
    const x = String(a._id), y = String(b._id);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const bounds = [];
  for (let i = 1; i < k; i++) {
    const idx = Math.floor((i * sampled.length) / k);
    const id = sampled[idx]?._id;
    if (id) bounds.push(String(id));
  }
  const uniq = [...new Set(bounds)];
  const ranges = [];
  let prev = null;
  for (const b of uniq) { ranges.push({ loHex: prev, hiHex: b }); prev = b; }
  ranges.push({ loHex: prev, hiHex: null });
  return ranges;
}

export async function processRange(coll, categoryToObs, dryRun, task, ObjectId, onProgress) {
  const { survey, loHex, hiHex } = task;
  const cfg = POSITION_CONFIG[survey];
  const stats = { processed: 0, changed: 0, unchanged: 0, skipped: 0 };
  const skipSamples = [];

  const hi = hiHex ? new ObjectId(hiHex) : null;
  let lastId = loHex ? new ObjectId(loHex) : null;
  let ops = [];
  const flush = async () => {
    if (!ops.length) return;
    if (!dryRun) await coll.bulkWrite(ops, { ordered: false });
    ops = [];
  };

  while (true) {
    const idCond = {};
    if (lastId) idCond.$gt = lastId;
    if (hi) idCond.$lte = hi;
    const q = { [FIELD.survey]: survey };
    if (Object.keys(idCond).length) q._id = idCond;

    const page = await coll.find(q).sort({ _id: 1 }).limit(PAGE_SIZE).toArray();
    if (page.length === 0) break;

    for (const doc of page) {
      lastId = doc._id;
      stats.processed++;
      const res = reorderDimensions(doc[FIELD.dimensions], doc[FIELD.obsHR], cfg, categoryToObs);
      if (res.skipped) {
        stats.skipped++;
        if (skipSamples.length < 5) skipSamples.push(`[${survey}] _id=${doc._id}: ${res.reason}`);
        continue;
      }
      if (!res.changed) { stats.unchanged++; continue; }
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

async function runWorker() {
  const { uri, dbName, collName, dryRun, categoryToObs } = workerData;
  const { MongoClient, ObjectId } = await import('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  const coll = client.db(dbName).collection(collName);

  parentPort.postMessage({ type: 'ready' });

  parentPort.on('message', async msg => {
    if (msg.cmd === 'stop') { await client.close(); process.exit(0); }
    if (msg.cmd === 'task') {
      try {
        const onProgress = delta => parentPort.postMessage({ type: 'progress', delta });
        const { stats, skipSamples } = await processRange(coll, categoryToObs, dryRun, msg.task, ObjectId, onProgress);
        parentPort.postMessage({ type: 'result', task: msg.task, stats, skipSamples });
      } catch (err) {
        parentPort.postMessage({ type: 'error', task: msg.task, message: err.message });
      }
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const workersArg = args.find(a => a.startsWith('--workers='));
  const WORKERS = Math.max(1, Number(workersArg?.split('=')[1] || process.env.WORKERS || os.cpus().length));

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:22000';
  const dbName = process.env.DB_NAME || 'query-engine';
  const collName = process.env.COLL || 'datapoints';

  const categoryToObs = JSON.parse(readFileSync(join(__dirname, 'category-to-obshr.json'), 'utf8'));
  for (const k of Object.keys(categoryToObs)) if (k.startsWith('__')) delete categoryToObs[k];

  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  const coll = client.db(dbName).collection(collName);

  const tasks = [];
  for (const survey of SURVEYS_TO_ORDER) {
    const cfg = POSITION_CONFIG[survey];
    if (!cfg || (!cfg.pins && !cfg.last)) { console.log(`— ${survey}: nessun vincolo, salto.`); continue; }
    const total = await coll.countDocuments({ [FIELD.survey]: survey });
    if (total === 0) { console.log(`— ${survey}: 0 record.`); continue; }
    const k = Math.max(1, Math.ceil(total / RANGE_TARGET));
    const ranges = await computeRanges(coll, survey, k);
    for (const r of ranges) tasks.push({ survey, ...r });
    console.log(`— ${survey}: ${total.toLocaleString()} record → ${ranges.length} range`);
  }
  await client.close(); 

  console.log(`\nAvvio ${WORKERS} worker su ${tasks.length} range${dryRun ? ' (dry-run)' : ''}...\n`);

  const agg = { total: 0, changed: 0, unchanged: 0, skipped: 0 };
  const skipSamples = [];
  let processedGlobal = 0, nextProgress = PROGRESS_EVERY;
  const queue = [...tasks];
  const wData = { uri, dbName, collName, dryRun, categoryToObs };

  await new Promise(resolve => {
    let alive = WORKERS;
    const assign = w => {
      const task = queue.shift();
      if (!task) { w.postMessage({ cmd: 'stop' }); return; }
      w.postMessage({ cmd: 'task', task });
    };
    for (let i = 0; i < WORKERS; i++) {
      const w = new Worker(new URL(import.meta.url), { workerData: wData });
      w.on('message', msg => {
        if (msg.type === 'ready') assign(w);
        else if (msg.type === 'progress') {
          processedGlobal += msg.delta;
          if (processedGlobal >= nextProgress) {
            console.log(`  avanzamento: ${processedGlobal.toLocaleString()} elaborati...`);
            nextProgress += PROGRESS_EVERY;
          }
        } else if (msg.type === 'result') {
          agg.total += msg.stats.processed;
          agg.changed += msg.stats.changed;
          agg.unchanged += msg.stats.unchanged;
          agg.skipped += msg.stats.skipped;
          for (const s of msg.skipSamples) if (skipSamples.length < 20) skipSamples.push(s);
          assign(w);
        } else if (msg.type === 'error') {
          console.error(`  ERRORE [${msg.task?.survey}]: ${msg.message}`);
          assign(w);
        }
      });
      w.on('error', e => console.error('Worker error:', e));
      w.on('exit', () => { if (--alive === 0) resolve(); });
    }
  });

  console.log('\n──────── RIEPILOGO ────────');
  console.log(agg);
  if (skipSamples.length) { console.log('\nEsempi di record saltati:'); console.log(skipSamples.join('\n')); }
  if (dryRun) console.log('\n(dry-run: nessuna scrittura effettuata)');
}

if (!isMainThread) {
  runWorker();
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => { console.error(err); process.exit(1); });
}
