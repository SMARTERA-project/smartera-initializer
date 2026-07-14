import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const POSITION_CONFIG = {

  BD_HGNACE_R: { pins: { 2: 'hgnace_activity' }, last: ['year'] },
  BD_SALGE1_NACE_R: { pins: { 1: 'employmentType', 2: 'nace_sector' }, last: ['year'] },
  BD_SALGE1_SIZE_R: { pins: { 2: 'enterprise_size_class' }, last: ['year'] },
  CENS_21COBHS_R3: { pins: { 1: 'birthCountry', 2: 'householdType', 3: 'cobhs_sex' }, last: ['year'] }, 
  CENS_21CTZ_R3: { pins: { 1: 'citizenship', 3: 'ctz_sex' }, last: ['year'] },                          
  //CENS_21LHA_R3: { pins: { 2: 'lha_sex' } },//TODO chiedere ai partner se serve
  CENS_21M_R3: { pins: { 1: 'maritalStatus', 2: 'm_sex' }, last: ['year'] },                           
  DEMO_R_D3DENS: { last: ['year'] },
  DEMO_R_GIND3: { last: ['gind3_indicator'] },
  DEMO_R_PJANAGGR3: { last: ['year'] },
  DEMO_R_PJANGRP3: { last: ['year'] },
  EDAT_LFSE_22: { last: ['year'] },
  EDUC_UOE_ENRA14: { last: ['year'] },
  EDUC_UOE_ENRT06: { last: ['year'] },
  EF_LUS_ALLCROPS: { pins: { 3: 'land_use_category' }, last: ['year'] },
  ENV_WASFAC: { last: ['year'] },
  HLTH_CO_DISCH1T: { pins: { 1: 'hosp_age_group', 5: 'diagnosis' }, last: ['year'] }, 
  ISOC_R_BLT12_I: { last: ['year'] },
  ISOC_R_CI_IT_EN2: { pins: { 1: 'enterprise_industry', 2: 'enterprise_size', 3: 'internet_speed', 4: 'enterprise_unit', 6: 'enterprise_year' }},
  ISOC_R_GOV_I: { last: ['year'] },
  ISOC_R_IACC_H: { last: ['year'] },
  ISOC_R_IUSE_I: { pins: { 1: 'internet_use_activity' }, last: ['year'] },
  NAMA_10R_3EMPERS: { pins: { 5: 'empers_year' } },
  NAMA_10R_3GDP: { last: ['gdp_group'] },
  NAMA_10R_3GVA: { pins: { 1: 'gva_group1', 4: 'gva_group2' } },
  NAMA_10R_3NLP: { last: ['year'] },
  NRG_CHDDR2_A: { last: ['year'] },
  PAT_EP_TOT: { pins: { 3: 'pat_region' }, last: ['year'] },
  RD_E_GERDREG: { last: ['year'] },
  ROAD_GO_NA_RL3G: { pins: { 0: 'rl3g_goods' }, last: ['year'] },
  ROAD_GO_NA_RU3G: { last: ['year'] },
  TRAN_R_ELVEHST: { last: ['year'] },
  TRAN_R_RAPA: { pins: { 2: 'rapa_reporting_region', 3: 'destination_region' }, last: ['year'] }
};

export const SURVEYS_TO_ORDER = Object.keys(POSITION_CONFIG);

const FIELD = { survey: 'survey', dimensions: 'dimensions', obsHR: 'obsHR' };

const BATCH_SIZE = 1000;     
const PAGE_SIZE = 5000;      
const PROGRESS_EVERY = 50000; 
const CHECKPOINT_FILE = join(__dirname, '.reorder-checkpoint.json');

export function reorderDimensions(dimensions, obsHR, surveyConfig, categoryToObs) {
  if (!Array.isArray(dimensions)) return { skipped: true, reason: 'dimensions non è un array' };
  if (!obsHR || typeof obsHR !== 'object') return { skipped: true, reason: 'obsHR mancante' };

  const n = dimensions.length;
  const result = new Array(n).fill(undefined);
  const used = new Array(n).fill(false);

  const takeLabel = label => {
    const idx = dimensions.findIndex((d, i) => !used[i] && d === label);
    if (idx === -1) return false;
    used[idx] = true;
    return true;
  };

  const resolveLabel = token => {
    const key = categoryToObs[token];
    if (!key) return { err: `nessuna chiave obsHR mappata per il token "${token}" (compila category-to-obshr.json)` };
    if (!(key in obsHR)) return { err: `il record non ha la chiave obsHR "${key}"` };
    return { label: obsHR[key] };
  };

  const place = (pos, token) => {
    if (pos < 0 || pos >= n) return `posizione ${pos} fuori range (len ${n})`;
    if (result[pos] !== undefined) return `posizione ${pos} già occupata (doppio pin)`;
    const { label, err } = resolveLabel(token);
    if (err) return err;
    if (!takeLabel(label)) return `label "${label}" non trovata in dimensions`;
    result[pos] = label;
    return null;
  };

  for (const [posStr, token] of Object.entries(surveyConfig.pins || {})) {
    const reason = place(Number(posStr), token);
    if (reason) return { skipped: true, reason };
  }
  for (const token of surveyConfig.last || []) {
    const reason = place(n - 1, token);
    if (reason) return { skipped: true, reason };
  }

  let cursor = 0;
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    while (cursor < n && result[cursor] !== undefined) cursor++;
    result[cursor++] = dimensions[i];
  }

  const changed = result.some((v, i) => v !== dimensions[i]);
  return { dimensions: result, changed, skipped: false };
}

function selfTest() {
  const assert = (cond, msg) => {
    if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
    else console.log('ok', msg);
  };

  const catMap = {
    enterprise_industry: 'IND', enterprise_size: 'SIZE', internet_speed: 'SPEED',
    enterprise_unit: 'UNIT', enterprise_year: 'TIME', gdp_group: 'AGE',
  };

  const dims = ['GEO_X', '2021', 'BigCo', 'Fiber', 'unitA', 'extra', 'ManufIndustry'];
  const obsHR = { IND: 'ManufIndustry', SIZE: 'BigCo', SPEED: 'Fiber', TIME: '2021', GEO: 'GEO_X', UNIT: 'unitA', X: 'extra' };
  const r = reorderDimensions(dims, obsHR, POSITION_CONFIG.ISOC_R_CI_IT_EN2, catMap);
  assert(!r.skipped, `ISOC riordino eseguito (${r.reason || 'ok'})`);
  assert(r.dimensions[1] === 'ManufIndustry', 'ISOC [1] = industry');
  assert(r.dimensions[2] === 'BigCo', 'ISOC [2] = size');
  assert(r.dimensions[3] === 'Fiber', 'ISOC [3] = speed');
  assert(r.dimensions[4] === 'unitA', 'ISOC [4] = unit (filterBy)');
  assert(r.dimensions[6] === '2021', 'ISOC [6] = year');
  assert(r.dimensions.length === dims.length, 'ISOC lunghezza invariata');
  assert([...r.dimensions].sort().join() === [...dims].sort().join(), 'ISOC nessuna label persa/duplicata');

  const dC = ['GEO', 'Italy', 'Family', 'Total', '2021'];
  const oC = { geo: 'GEO', cob: 'Italy', hh: 'Family', sex: 'Total', time: '2021' };
  const mC = { birthCountry: 'cob', householdType: 'hh', cobhs_sex: 'sex' };
  const rC = reorderDimensions(dC, oC, POSITION_CONFIG.CENS_21COBHS_R3, mC);
  assert(!rC.skipped, `CENS riordino eseguito (${rC.reason || 'ok'})`);
  assert(rC.dimensions[1] === 'Italy', 'CENS [1] = birthCountry');
  assert(rC.dimensions[2] === 'Family', 'CENS [2] = householdType');
  assert(rC.dimensions[3] === 'Total', 'CENS [3] = sex (filterBy)');

  const d2 = ['Y15-64', 'GEO_Z', '2020'];
  const o2 = { AGE: 'Y15-64', GEO: 'GEO_Z', TIME: '2020' };
  const r2 = reorderDimensions(d2, o2, POSITION_CONFIG.NAMA_10R_3GDP, catMap);
  assert(!r2.skipped, `GDP riordino eseguito (${r2.reason || 'ok'})`);
  assert(r2.dimensions[r2.dimensions.length - 1] === 'Y15-64', 'GDP ultima = age group');

  const r3 = reorderDimensions(dims, obsHR, POSITION_CONFIG.ISOC_R_CI_IT_EN2, {});
  assert(r3.skipped && /nessuna chiave obsHR/.test(r3.reason), 'token non mappato -> skip motivato');

  console.log('\nSelf-test completato.');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--self-test')) return selfTest();

  const dryRun = args.has('--dry-run');

  const categoryToObs = JSON.parse(readFileSync(join(__dirname, 'category-to-obshr.json'), 'utf8'));
  for (const k of Object.keys(categoryToObs)) if (k.startsWith('__')) delete categoryToObs[k];

  if (args.has('--reset') && existsSync(CHECKPOINT_FILE)) {
    writeFileSync(CHECKPOINT_FILE, '{}');
    console.log('Checkpoint azzerato.');
  }
  let checkpoints = {};
  if (!dryRun && existsSync(CHECKPOINT_FILE)) {
    try { checkpoints = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf8')); }
    catch { checkpoints = {}; }
  }
  const saveCheckpoints = () => {
    if (dryRun) return;
    writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoints, null, 2));
  };

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:22000';
  const dbName = process.env.DB_NAME || 'query-engine';
  const collName = process.env.COLL || 'datapoints';

  const { MongoClient, ObjectId } = await import('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  const coll = client.db(dbName).collection(collName);

  const stats = { total: 0, changed: 0, unchanged: 0, skipped: 0 };
  const skipSamples = [];

  try {
    for (const survey of SURVEYS_TO_ORDER) {
      const cfg = POSITION_CONFIG[survey];
      if (!cfg || (!cfg.pins && !cfg.last)) {
        console.log(`— ${survey}: nessun vincolo posizionale, salto.`);
        continue;
      }

      const cp = checkpoints[survey];
      if (cp?.done) { console.log(`— ${survey}: già completata (checkpoint), salto.`); continue; }

      const filter = { [FIELD.survey]: survey };
      let lastId = cp?.lastId ? new ObjectId(cp.lastId) : null;

      const countFilter = lastId ? { ...filter, _id: { $gt: lastId } } : filter;
      const totalForSurvey = await coll.countDocuments(countFilter);
      console.log(`\n— ${survey}: ${totalForSurvey.toLocaleString()} record da elaborare${lastId ? ' (resume da checkpoint)' : ''}...`);

      let ops = [];
      let processed = 0, toUpdate = 0, skipped = 0, nextProgress = PROGRESS_EVERY;
      const flush = async () => {
        if (!ops.length) return;
        if (!dryRun) await coll.bulkWrite(ops, { ordered: false });
        ops = [];
      };

      while (true) {
        const q = lastId ? { ...filter, _id: { $gt: lastId } } : filter;
        const page = await coll.find(q).sort({ _id: 1 }).limit(PAGE_SIZE).toArray();
        if (page.length === 0) break;

        for (const doc of page) {
          lastId = doc._id;
          stats.total++; processed++;
          const res = reorderDimensions(doc[FIELD.dimensions], doc[FIELD.obsHR], cfg, categoryToObs);
          if (res.skipped) {
            stats.skipped++; skipped++;
            if (skipSamples.length < 20) skipSamples.push(`  [${survey}] _id=${doc._id}: ${res.reason}`);
            continue;
          }
          if (!res.changed) { stats.unchanged++; continue; }
          stats.changed++; toUpdate++;
          ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { [FIELD.dimensions]: res.dimensions } } } });
          if (ops.length >= BATCH_SIZE) await flush();
        }
        await flush();

        checkpoints[survey] = { lastId: lastId ? lastId.toHexString() : null, done: false };
        saveCheckpoints();

        if (processed >= nextProgress) {
          console.log(`  [${survey}] ${processed.toLocaleString()}/${totalForSurvey.toLocaleString()} — aggiornati ${toUpdate.toLocaleString()}, saltati ${skipped.toLocaleString()}`);
          nextProgress += PROGRESS_EVERY;
        }
      }

      checkpoints[survey] = { lastId: lastId ? lastId.toHexString() : null, done: true };
      saveCheckpoints();
      console.log(`ok ${survey}: ${toUpdate.toLocaleString()} da aggiornare${dryRun ? ' (dry-run, non scritto)' : ' scritti'} su ${processed.toLocaleString()} (saltati ${skipped.toLocaleString()}).`);
    }
  } finally {
    await client.close();
  }

  console.log('\n──────── RIEPILOGO ────────');
  console.log(stats);
  if (skipSamples.length) { console.log('\nEsempi di record saltati:'); console.log(skipSamples.join('\n')); }
  if (dryRun) console.log('\n(dry-run: nessuna scrittura, checkpoint non aggiornato)');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => { console.error(err); process.exit(1); });
}
