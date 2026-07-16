import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIELD = { survey: 'survey', dimensions: 'dimensions', obsHR: 'obsHR' };

export function keysForLabel(obsHR, label) {
  const out = [];
  for (const k in obsHR) if (obsHR[k] === label) out.push(k);
  return out;
}

export function accumulate(candidates, obsHR, dims) {
  const L = dims.length;
  if (!candidates) candidates = Array.from({ length: L }, () => null);
  for (let i = 0; i < L; i++) {
    const here = new Set(keysForLabel(obsHR, dims[i]));
    if (candidates[i] == null) candidates[i] = here;
    else candidates[i] = new Set([...candidates[i]].filter((k) => here.has(k)));
  }
  return candidates;
}

export function resolve(candidates) {
  const L = candidates.length;
  const cand = candidates.map((s) => new Set(s || []));
  const resolved = new Array(L).fill(null);
  let conflict = null;

  const assign = (i, key) => {
    resolved[i] = key;
    cand[i] = new Set([key]);
    for (let j = 0; j < L; j++) {
      if (j !== i && cand[j].has(key)) {
        cand[j].delete(key);
        if (cand[j].size === 0 && resolved[j] === null) {
          conflict = conflict || `posizione ${j} senza candidati dopo l'assegnazione di "${key}" a ${i}`;
        }
      }
    }
  };

  let changed = true;
  while (changed && !conflict) {
    changed = false;
    for (let i = 0; i < L; i++) {
      if (resolved[i] === null && cand[i].size === 1) {
        assign(i, [...cand[i]][0]);
        changed = true;
      }
    }
    const posByKey = new Map();
    for (let i = 0; i < L; i++) {
      if (resolved[i] !== null) continue;
      for (const k of cand[i]) {
        if (!posByKey.has(k)) posByKey.set(k, []);
        posByKey.get(k).push(i);
      }
    }
    for (const [k, pos] of posByKey) {
      if (pos.length === 1 && resolved[pos[0]] === null) {
        assign(pos[0], k);
        changed = true;
      }
    }
  }

  const fullyResolved = !conflict && resolved.every((x) => x !== null);
  return { resolved, cand, fullyResolved, conflict };
}

function compareToConfig(survey, resolvedKeys, cfg, CAT) {
  if (!cfg) return null;
  const L = resolvedKeys.length;
  const rows = [];
  for (const [posStr, token] of Object.entries(cfg.pins || {})) {
    const pos = Number(posStr);
    const expKey = CAT[token] ?? `?(token ${token} non mappato)`;
    const gotKey = pos < L ? resolvedKeys[pos] : `?(fuori range, len ${L})`;
    rows.push({ pos, token, expKey, gotKey, ok: gotKey === expKey });
  }
  for (const token of cfg.last || []) {
    const expKey = CAT[token] ?? `?(token ${token} non mappato)`;
    const gotKey = resolvedKeys[L - 1];
    rows.push({ pos: L - 1, token: `${token} (last)`, expKey, gotKey, ok: gotKey === expKey });
  }
  return rows;
}

function selfTest() {
  let fails = 0;
  const ok = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); fails++; } else console.log('ok', msg); };

  ok(keysForLabel({ sex: 'Total', marsta: 'Single' }, 'Total').join() === 'sex', 'keysForLabel base');
  ok(keysForLabel({ a: 'X', b: 'X' }, 'X').sort().join() === 'a,b', 'keysForLabel duplicati');

  let c = accumulate(null, { geo: 'Sofia', sex: 'Total', time_period: '2021' }, ['Sofia', 'Total', '2021']);
  let r = resolve(c);
  ok(r.fullyResolved, 'doc unico valori distinti -> risolto');
  ok(r.resolved[0] === 'geo' && r.resolved[1] === 'sex' && r.resolved[2] === 'time_period', 'mappa corretta');

  const docA = { geo: 'Sofia', sex: 'Total', marsta: 'Total', time_period: '2021' };
  const docB = { geo: 'Varna', sex: 'Total', marsta: 'Single', time_period: '2021' };
  c = accumulate(null, docA, ['Sofia', 'Total', 'Total', '2021']);
  r = resolve(c);
  ok(!r.fullyResolved, 'un solo doc ambiguo -> NON risolto');
  c = accumulate(c, docB, ['Varna', 'Total', 'Single', '2021']);
  r = resolve(c);
  ok(r.fullyResolved, 'secondo doc scioglie l ambiguita');
  ok(r.resolved[1] === 'sex' && r.resolved[2] === 'marsta', 'assegnazione corretta dopo disambiguazione');

  c = accumulate(null, { a: 'V', b: 'V', t: '2021' }, ['V', 'V', '2021']);
  c = accumulate(c, { a: 'W', b: 'W', t: '2022' }, ['W', 'W', '2022']);
  r = resolve(c);
  ok(!r.fullyResolved, 'chiavi gemelle -> resta ambiguo');
  ok([...r.cand[0]].sort().join() === 'a,b', 'candidati residui elencati');

  const rows = compareToConfig('X', ['geo', 'sex', 'time_period'],
    { pins: { 1: 'the_sex' }, last: ['year'] }, { the_sex: 'sex', year: 'time_period' });
  ok(rows[0].ok === true, 'compare pin OK');
  ok(rows[1].ok === true, 'compare last OK');
  const rows2 = compareToConfig('X', ['geo', 'time_period', 'sex'],
    { pins: { 1: 'the_sex' } }, { the_sex: 'sex' });
  ok(rows2[0].ok === false, 'compare pin MISMATCH rilevato');

  console.log(fails ? `\n${fails} FAIL` : '\nself-test OK');
  process.exitCode = fails ? 1 : 0;
}

function parseArgs(argv) {
  const a = { sample: 200, max: 4000, json: false, all: false, surveys: null };
  for (const x of argv) {
    if (x === '--json') a.json = true;
    else if (x === '--all') a.all = true;
    else if (x.startsWith('--sample=')) a.sample = Number(x.slice(9));
    else if (x.startsWith('--max=')) a.max = Number(x.slice(6));
    else if (x.startsWith('--survey=')) a.surveys = x.slice(9).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return a;
}

async function analyzeSurvey(coll, survey, opts) {
  const buckets = new Map(); // L -> { candidates, count, example:Map<pos,label> }
  const feed = (obsHR, dims) => {
    const L = dims.length;
    let b = buckets.get(L);
    if (!b) { b = { candidates: null, count: 0, example: new Map() }; buckets.set(L, b); }
    b.candidates = accumulate(b.candidates, obsHR, dims);
    dims.forEach((lab, i) => { if (!b.example.has(i)) b.example.set(i, lab); });
    b.count++;
  };

  let used = 0, batches = 0, lastRes = null, domLen = null;
  while (used < opts.max) {
    const size = Math.min(opts.sample, opts.max - used);
    const docs = await coll.aggregate(
      [
        { $match: { [FIELD.survey]: survey } },
        { $sample: { size } },
        { $project: { _id: 0, [FIELD.dimensions]: 1, [FIELD.obsHR]: 1 } },
      ],
      { allowDiskUse: true }
    ).toArray();
    if (!docs.length) break;
    batches++;
    for (const d of docs) {
      if (!Array.isArray(d.dimensions) || !d.obsHR || typeof d.obsHR !== 'object') continue;
      feed(d.obsHR, d.dimensions);
      used++;
    }
    domLen = [...buckets.entries()].sort((x, y) => y[1].count - x[1].count)[0][0];
    lastRes = resolve(buckets.get(domLen).candidates || []);
    if (lastRes.fullyResolved || lastRes.conflict) break;
    if (docs.length < size) break;
  }

  const lengths = [...buckets.entries()].map(([L, b]) => ({ len: L, count: b.count })).sort((a, b) => b.count - a.count);
  const b = domLen != null ? buckets.get(domLen) : null;
  return {
    survey, used, batches, lengths, domLen,
    example: b ? b.example : new Map(),
    ...(lastRes || { resolved: [], cand: [], fullyResolved: false, conflict: 'nessun documento' }),
  };
}

function printReport(res, cfg, CAT) {
  const mark = res.fullyResolved ? 'RISOLTO' : (res.conflict ? 'CONFLITTO' : 'AMBIGUO');
  console.log(`\n=== ${res.survey}  [${mark}]  doc usati:${res.used} batch:${res.batches} len:${res.domLen ?? '-'} ===`);
  if (res.lengths.length > 1) {
    console.log('  lunghezze dimensions: ' + res.lengths.map((l) => `${l.len}(${l.count})`).join(', '));
  }
  if (res.conflict) console.log('  ! ' + res.conflict);
  for (let i = 0; i < res.resolved.length; i++) {
    const key = res.resolved[i];
    const ex = res.example.get(i);
    if (key) console.log(`  [${i}] ${key}   es. "${ex}"`);
    else console.log(`  [${i}] ?? candidati: {${[...(res.cand[i] || [])].join(', ') || '—'}}   es. "${ex}"`);
  }
  const cmp = compareToConfig(res.survey, res.resolved, cfg, CAT);
  if (cmp && cmp.length) {
    console.log('  -- confronto con POSITION_CONFIG --');
    for (const r of cmp) {
      console.log(`  [${r.pos}] ${r.ok ? 'OK ' : 'MISMATCH'} atteso=${r.expKey} dedotto=${r.gotKey}  (${r.token})`);
    }
    const bad = cmp.filter((r) => !r.ok).length;
    if (bad) console.log(`  >>> ${bad} posizione/i NON allineata/e alla config`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let POSITION_CONFIG = {}, SURVEYS_TO_ORDER = [], CAT = {};
  try {
    const mod = await import('./reorder-dimensions.mjs');
    POSITION_CONFIG = mod.POSITION_CONFIG || {};
    SURVEYS_TO_ORDER = mod.SURVEYS_TO_ORDER || Object.keys(POSITION_CONFIG);
  } catch (e) { console.warn('avviso: impossibile importare POSITION_CONFIG (' + e.message + ')'); }
  try {
    CAT = JSON.parse(readFileSync(join(__dirname, 'category-to-obshr.json'), 'utf8'));
    delete CAT.__hints__;
  } catch (err) {
    console.error('avviso: impossibile leggere category-to-obshr.json (' + err.message + ')');
  }

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:22000';
  const dbName = process.env.DB_NAME || 'query-engine';
  const collName = process.env.COLL || 'datapoints';

  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  const coll = client.db(dbName).collection(collName);

  let surveys = opts.surveys;
  if (!surveys) {
    surveys = opts.all
      ? (await coll.distinct(FIELD.survey)).filter(Boolean).sort()
      : SURVEYS_TO_ORDER;
  }

  const out = [];
  for (const s of surveys) {
    const res = await analyzeSurvey(coll, s, opts);
    out.push({ res, cfg: POSITION_CONFIG[s] });
    if (!opts.json) printReport(res, POSITION_CONFIG[s], CAT);
  }

  if (opts.json) {
    const serial = out.map(({ res, cfg }) => ({
      survey: res.survey, status: res.fullyResolved ? 'resolved' : (res.conflict ? 'conflict' : 'ambiguous'),
      docsUsed: res.used, dominantLen: res.domLen, lengths: res.lengths, conflict: res.conflict || null,
      layout: res.resolved.map((key, i) => ({ pos: i, key, example: res.example.get(i) ?? null, candidates: key ? undefined : [...(res.cand[i] || [])] })),
      compare: compareToConfig(res.survey, res.resolved, cfg, CAT),
    }));
    console.log(JSON.stringify(serial, null, 2));
  } else {
    const amb = out.filter(({ res }) => !res.fullyResolved);
    console.log(`\n──────── riepilogo: ${out.length} survey, ${out.length - amb.length} risolte, ${amb.length} da rivedere ────────`);
    if (amb.length) console.log('da rivedere: ' + amb.map(({ res }) => `${res.survey}(${res.conflict ? 'conflitto' : 'ambiguo'})`).join(', '));
  }

  await client.close();
}

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntry) {
  if (process.argv.includes('--self-test')) selfTest();
  else main().catch((e) => { console.error(e); process.exit(1); });
}