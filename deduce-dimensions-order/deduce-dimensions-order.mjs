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

export function checkDoc(dims, obsHR, cfg, CAT) {
  const problems = [];
  if (!cfg || !Array.isArray(dims)) return problems;
  const L = dims.length;
  const ob = obsHR && typeof obsHR === 'object' ? obsHR : {};

  const checkAt = (pos, token, isLast) => {
    const key = CAT[token];
    const label = isLast ? `${token} (last)` : token;
    if (!key) { problems.push({ pos, token: label, kind: 'token-unmapped' }); return; }
    const exp = ob[key];
    if (exp === undefined) { problems.push({ pos, token: label, kind: 'no-key', detail: key }); return; }
    if (pos < 0 || pos >= L) { problems.push({ pos, token: label, kind: 'out-of-range', exp }); return; }
    if (dims[pos] !== exp) problems.push({ pos, token: label, kind: 'wrong', got: dims[pos], exp });
  };

  for (const [posStr, token] of Object.entries(cfg.pins || {})) checkAt(Number(posStr), token, false);
  for (const token of cfg.last || []) checkAt(L - 1, token, true);
  return problems;
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
  ok(rows[0].ok === true && rows[1].ok === true, 'compare pin+last OK');
  const rows2 = compareToConfig('X', ['geo', 'time_period', 'sex'],
    { pins: { 1: 'the_sex' } }, { the_sex: 'sex' });
  ok(rows2[0].ok === false, 'compare pin MISMATCH rilevato');

  const cfg = { pins: { 2: 'the_sex' }, last: ['year'] };
  const CAT = { the_sex: 'sex', year: 'time_period' };
  const good = checkDoc(['Sofia', 'Married', 'Total', '2021'],
    { geo: 'Sofia', marsta: 'Married', sex: 'Total', time_period: '2021' }, cfg, CAT);
  ok(good.length === 0, 'checkDoc: documento conforme -> 0 problemi');
  const bad = checkDoc(['Sofia', 'Total', 'Married', '2021'],
    { geo: 'Sofia', sex: 'Total', marsta: 'Married', time_period: '2021' }, cfg, CAT);
  ok(bad.length === 1 && bad[0].kind === 'wrong' && bad[0].pos === 2 && bad[0].got === 'Married' && bad[0].exp === 'Total',
    'checkDoc: sesso fuori posto rilevato (wrong)');
  const noKey = checkDoc(['Sofia', 'X', 'Y', '2021'], { geo: 'Sofia', time_period: '2021' }, cfg, CAT);
  ok(noKey.some((p) => p.kind === 'no-key' && p.detail === 'sex'), 'checkDoc: chiave obsHR mancante rilevata');
  const lastBad = checkDoc(['Sofia', 'M', 'Total', '2021', 'coda'],
    { geo: 'Sofia', marsta: 'M', sex: 'Total', time_period: '2021', extra: 'coda' }, cfg, CAT);
  ok(lastBad.some((p) => p.token === 'year (last)' && p.kind === 'wrong'), 'checkDoc: anno non in ultima posizione rilevato');

  console.log(fails ? `\n${fails} FAIL` : '\nself-test OK');
  process.exitCode = fails ? 1 : 0;
}

function makeBuckets() {
  const buckets = new Map();
  const feed = (obsHR, dims) => {
    const L = dims.length;
    let b = buckets.get(L);
    if (!b) { b = { candidates: null, count: 0, example: new Map() }; buckets.set(L, b); }
    b.candidates = accumulate(b.candidates, obsHR, dims);
    dims.forEach((lab, i) => { if (!b.example.has(i)) b.example.set(i, lab); });
    b.count++;
  };
  const summary = () => {
    const lengths = [...buckets.entries()].map(([L, b]) => ({ len: L, count: b.count })).sort((a, b) => b.count - a.count);
    const domLen = lengths.length ? lengths[0].len : null;
    const b = domLen != null ? buckets.get(domLen) : null;
    const res = resolve((b && b.candidates) || []);
    return { lengths, domLen, example: b ? b.example : new Map(), ...res };
  };
  return { feed, summary };
}

async function analyzeSurvey(coll, survey, opts) {
  const { feed, summary } = makeBuckets();
  let used = 0, batches = 0, s = null;
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
    s = summary();
    if (s.fullyResolved || s.conflict) break;
    if (docs.length < size) break;
  }
  s = s || summary();
  return { survey, mode: 'sample', used, batches, ...s };
}

async function scanSurvey(coll, survey, opts, cfg, CAT) {
  const { feed, summary } = makeBuckets();
  let lastId = null, total = 0, badDocs = 0, anomalies = 0;
  const byIssue = new Map(); // `${pos}:${token}:${kind}` -> { count, examples:[] }
  const cap = opts.max ?? Infinity;

  while (total < cap) {
    const q = { [FIELD.survey]: survey };
    if (lastId != null) q._id = { $gt: lastId };
    const docs = await coll.find(q, { projection: { _id: 1, [FIELD.dimensions]: 1, [FIELD.obsHR]: 1 } })
      .sort({ _id: 1 }).limit(opts.page).toArray();
    if (!docs.length) break;
    for (const d of docs) {
      lastId = d._id;
      if (!Array.isArray(d.dimensions)) { anomalies++; continue; }
      total++;
      feed(d.obsHR && typeof d.obsHR === 'object' ? d.obsHR : {}, d.dimensions);
      const probs = checkDoc(d.dimensions, d.obsHR, cfg, CAT);
      if (probs.length) {
        badDocs++;
        for (const p of probs) {
          const k = `${p.pos}:${p.token}:${p.kind}`;
          let e = byIssue.get(k);
          if (!e) { e = { pos: p.pos, token: p.token, kind: p.kind, count: 0, examples: [] }; byIssue.set(k, e); }
          e.count++;
          if (e.examples.length < 5) e.examples.push({ id: String(d._id), got: p.got, exp: p.exp, detail: p.detail });
        }
      }
    }
    if (docs.length < opts.page) break;
  }
  return { survey, mode: 'scan', total, badDocs, anomalies, byIssue, ...summary() };
}

function printLayout(res) {
  for (let i = 0; i < res.resolved.length; i++) {
    const key = res.resolved[i];
    const ex = res.example.get(i);
    if (key) console.log(`  [${i}] ${key}   es. "${ex}"`);
    else console.log(`  [${i}] ?? candidati: {${[...(res.cand[i] || [])].join(', ') || '—'}}   es. "${ex}"`);
  }
}

function printReport(res, cfg, CAT) {
  const mark = res.fullyResolved ? 'RISOLTO' : (res.conflict ? 'CONFLITTO' : 'AMBIGUO');
  if (res.mode === 'scan') {
    console.log(`\n=== ${res.survey}  [SCAN · layout ${mark}]  doc totali:${res.total}${res.anomalies ? ` anomalie:${res.anomalies}` : ''} len:${res.domLen ?? '-'} ===`);
  } else {
    console.log(`\n=== ${res.survey}  [${mark}]  doc usati:${res.used} batch:${res.batches} len:${res.domLen ?? '-'} ===`);
  }
  if (res.lengths.length > 1) console.log('  lunghezze dimensions: ' + res.lengths.map((l) => `${l.len}(${l.count})`).join(', '));
  if (res.conflict) console.log('  ! ' + res.conflict);
  printLayout(res);

  if (res.mode === 'scan' && cfg) {
    const conformi = res.total - res.badDocs;
    console.log(`  -- verifica per-documento vs POSITION_CONFIG --`);
    console.log(`  ${conformi}/${res.total} doc conformi, ${res.badDocs} fuori posto`);
    for (const e of [...res.byIssue.values()].sort((a, b) => b.count - a.count)) {
      const ex = e.examples.map((x) => {
        if (e.kind === 'wrong') return `${x.id}(got "${x.got}" ≠ atteso "${x.exp}")`;
        if (e.kind === 'no-key') return `${x.id}(manca obsHR.${x.detail})`;
        return x.id;
      }).join(', ');
      console.log(`  [${e.pos}] ${e.token}: ${e.count} doc — ${e.kind} — es. ${ex}`);
    }
    if (res.badDocs === 0) console.log('  >>> tutti i documenti rispettano la config');
    return;
  }

  const cmp = compareToConfig(res.survey, res.resolved, cfg, CAT);
  if (cmp && cmp.length) {
    console.log('  -- confronto layout dedotto vs POSITION_CONFIG --');
    for (const r of cmp) console.log(`  [${r.pos}] ${r.ok ? 'OK ' : 'MISMATCH'} atteso=${r.expKey} dedotto=${r.gotKey}  (${r.token})`);
    const bad = cmp.filter((r) => !r.ok).length;
    if (bad) console.log(`  >>> ${bad} posizione/i NON allineata/e alla config`);
  }
}

function parseArgs(argv) {
  const a = { sample: 200, page: 2000, max: null, json: false, all: false, scan: false, surveys: null };
  for (const x of argv) {
    if (x === '--json') a.json = true;
    else if (x === '--all') a.all = true;
    else if (x === '--scan') a.scan = true;
    else if (x.startsWith('--sample=')) a.sample = Number(x.slice(9));
    else if (x.startsWith('--page=')) a.page = Number(x.slice(7));
    else if (x.startsWith('--max=')) a.max = Number(x.slice(6));
    else if (x.startsWith('--survey=')) a.surveys = x.slice(9).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return a;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.scan && opts.max == null) opts.max = 4000;

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
  if (!surveys) surveys = opts.all ? (await coll.distinct(FIELD.survey)).filter(Boolean).sort() : SURVEYS_TO_ORDER;

  const out = [];
  for (const s of surveys) {
    const cfg = POSITION_CONFIG[s];
    const res = opts.scan ? await scanSurvey(coll, s, opts, cfg, CAT) : await analyzeSurvey(coll, s, opts);
    out.push({ res, cfg });
    if (!opts.json) printReport(res, cfg, CAT);
  }

  if (opts.json) {
    const serial = out.map(({ res, cfg }) => ({
      survey: res.survey, mode: res.mode,
      status: res.fullyResolved ? 'resolved' : (res.conflict ? 'conflict' : 'ambiguous'),
      docs: res.mode === 'scan' ? res.total : res.used, dominantLen: res.domLen, lengths: res.lengths,
      conflict: res.conflict || null,
      layout: res.resolved.map((key, i) => ({ pos: i, key, example: res.example.get(i) ?? null, candidates: key ? undefined : [...(res.cand[i] || [])] })),
      ...(res.mode === 'scan'
        ? { verify: { badDocs: res.badDocs, anomalies: res.anomalies, issues: [...res.byIssue.values()] } }
        : { compare: compareToConfig(res.survey, res.resolved, cfg, CAT) }),
    }));
    console.log(JSON.stringify(serial, null, 2));
  } else {
    const amb = out.filter(({ res }) => !res.fullyResolved);
    console.log(`\n──────── riepilogo: ${out.length} survey, ${out.length - amb.length} risolte, ${amb.length} da rivedere ────────`);
    if (opts.scan) {
      const dirty = out.filter(({ res }) => res.badDocs > 0);
      if (dirty.length) console.log('con doc fuori posto: ' + dirty.map(({ res }) => `${res.survey}(${res.badDocs})`).join(', '));
      else console.log('nessun documento fuori posto rilevato nelle survey con config.');
    }
    if (amb.length) console.log('layout da rivedere: ' + amb.map(({ res }) => `${res.survey}(${res.conflict ? 'conflitto' : 'ambiguo'})`).join(', '));
  }

  await client.close();
}

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntry) {
  if (process.argv.includes('--self-test')) selfTest();
  else main().catch((e) => { console.error(e); process.exit(1); });
}
