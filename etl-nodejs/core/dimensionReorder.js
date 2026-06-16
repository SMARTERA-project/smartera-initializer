/**
 * dimensionReorder.js
 *
 * Per ogni query GraphQL del piano di esecuzione:
 *   1. Chiama il primo endpoint (graphqlEndpoint) → ottiene datapoints con dimensions e survey
 *   2. Chiama il secondo endpoint (referenceEndpoint) con la stessa query → ottiene l'ordine di riferimento
 *   3. Trova la prima coppia di dimensions con labels in comune tra i due set di risultati
 *   4. Usa l'ordine delle labels del secondo come riferimento per riordinare quelle del primo
 *   5. Aggiorna su Mongo solo il campo dimensions dei record che matchano { survey: SURVEY.toUpperCase() }
 *
 * Uso:
 *   node core/dimensionReorder.js            → dry-run (nessuna modifica al db)
 *   node core/dimensionReorder.js --apply    → aggiornamento reale
 */

const { MongoClient } = require("mongodb");
const config = require("../config");
const githubService = require("../services/github");
const graphqlService = require("../services/graphql");
const etlProcessor = require("./etlProcessor");
const fs = require("fs").promises;

const DRY_RUN = !process.argv.includes("--apply");

// ─── Mongo (datapoints, query-engine) ────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI_QE || "mongodb://localhost:22000";
const DB_NAME = "query-engine";
const COLLECTION_NAME = "datapoints";
const BATCH_SIZE = 500;

// ─── Secondo endpoint ─────────────────────────────────────────────────────────
// Stessa query, base URL diverso: impostare REFERENCE_GRAPHQL_ENDPOINT in env
const REFERENCE_ENDPOINT =
  process.env.REFERENCE_GRAPHQL_ENDPOINT ||
  "https://smartera.feri.um.si/graphql";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Esegue una query GraphQL su un endpoint arbitrario (non usa graphqlService
 * che ha l'URL hardcoded in config, ma replica la stessa logica).
 */
async function executeQueryOn(endpoint, queryString, variables) {
  const payload = { query: queryString };
  if (variables) payload.variables = variables;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} da ${endpoint}: ${text}`);
  }

  const result = await response.json();
  if (result.errors) throw new Error(result.errors[0].message);
  return result.data;
}

/**
 * Estrae l'array di datapoints dal body GraphQL:
 * { data: { datapoints: [...] } }  oppure  { datapoints: [...] }
 */
function extractDatapoints(raw) {
  const root = raw?.data || raw;
  if (!root) return [];
  // Cerca la prima chiave il cui valore è un array
  for (const val of Object.values(root)) {
    if (Array.isArray(val)) return val;
  }
  return [];
}

/**
 * Dati due array di dimensions (ognuno è un array di label-string),
 * trova la prima coppia (A da source, B da reference) che condivide
 * almeno un elemento, poi restituisce l'ordine di B come riferimento.
 *
 * Ritorna: { sourceIdx, refIdx, orderedLabels }
 * oppure null se non si trova nessuna coppia in comune.
 */
function findMatchingPair(sourceDims, refDims) {
  for (let si = 0; si < sourceDims.length; si++) {
    const srcSet = new Set(sourceDims[si]);
    for (let ri = 0; ri < refDims.length; ri++) {
      const refLabels = refDims[ri];
      const hasCommon = refLabels.some((l) => srcSet.has(l));
      if (hasCommon) {
        return { sourceIdx: si, refIdx: ri, orderedLabels: refLabels };
      }
    }
  }
  return null;
}

/**
 * Riordina le labels di `sourceDim` seguendo l'ordine di `refLabels`.
 * Le labels presenti in source ma non in ref vengono aggiunte in coda
 * (invariato rispetto all'originale).
 */
function reorderLabels(sourceDim, refLabels) {
  const refOrder = refLabels.filter((l) => sourceDim.includes(l));
  const extras = sourceDim.filter((l) => !refLabels.includes(l));
  return [...refOrder, ...extras];
}

/**
 * Dato un array di datapoints (dalla risposta GraphQL),
 * costruisce la mappa:  survey_UPPERCASE → [ array di dimensions riordinate ]
 *
 * "dimensions riordinate" significa: per ogni datapoint si applica
 * il reorder sulla coppia matchante; le altre dimensions restano invariate.
 */
function buildReorderMap(sourceDatapoints, refDatapoints) {
  const map = new Map(); // survey → dimensions[]

  // Raccoglie tutte le dimensions di riferimento (una volta sola)
  const allRefDims = refDatapoints
    .map((dp) => dp.dimensions)
    .filter((d) => Array.isArray(d));

  for (const dp of sourceDatapoints) {
    if (!dp.dimensions || !Array.isArray(dp.dimensions)) continue;
    const survey = dp.survey;
    if (!survey) continue;
    const surveyKey = survey.toUpperCase();

    // Trova la coppia matchante tra le dimensions di questo datapoint e quelle di ref
    const match = findMatchingPair([dp.dimensions], allRefDims);

    let newDimensions;
    if (match) {
      newDimensions = reorderLabels(dp.dimensions, match.orderedLabels);
    } else {
      // Nessuna coppia trovata → lascia invariato (come da specifica)
      newDimensions = dp.dimensions;
    }

    if (!map.has(surveyKey)) map.set(surveyKey, []);
    map.get(surveyKey).push({ original: dp.dimensions, reordered: newDimensions });
  }

  return map;
}

// ─── Core ─────────────────────────────────────────────────────────────────────

async function processTask(task, queryString, mongoCollection) {
  // Determina le variabili da passare
  let variables = task.baseVariables || undefined;
  let chosenCandidate = null;

  // 1. Prima chiamata (endpoint principale) — replica la logica di etlProcessor
  let sourceDatapoints = [];

  if (task.candidates && task.candidates.length > 0) {
    for (const candidate of task.candidates) {
      const vars = { village: candidate };
      const raw = await graphqlService.executeQuery(queryString, vars);
      const dps = extractDatapoints(raw);
      if (dps.length > 0) {
        sourceDatapoints = dps;
        chosenCandidate = candidate;
        break;
      }
    }
  } else {
    const raw = await graphqlService.executeQuery(queryString, variables);
    sourceDatapoints = extractDatapoints(raw);
  }

  if (sourceDatapoints.length === 0) {
    console.log(`    [SKIP] Nessun datapoint dalla prima chiamata per: ${task.reference}`);
    return { updated: 0, skipped: 0 };
  }

  // 2. Seconda chiamata (endpoint di riferimento) — stessa query, stesso candidate/vars
  let refVars = chosenCandidate ? { village: chosenCandidate } : variables;
  let refDatapoints = [];
  try {
    const refRaw = await executeQueryOn(REFERENCE_ENDPOINT, queryString, refVars);
    refDatapoints = extractDatapoints(refRaw);
  } catch (err) {
    console.warn(`    [WARN] Endpoint di riferimento non raggiungibile per ${task.reference}: ${err.message}`);
    return { updated: 0, skipped: sourceDatapoints.length };
  }

  if (refDatapoints.length === 0) {
    console.log(`    [SKIP] Nessun datapoint dal riferimento per: ${task.reference}`);
    return { updated: 0, skipped: sourceDatapoints.length };
  }

  // 3. Costruisce la mappa survey → dimensions riordinate
  const reorderMap = buildReorderMap(sourceDatapoints, refDatapoints);

  if (reorderMap.size === 0) {
    console.log(`    [SKIP] Nessuna survey individuata nei datapoints per: ${task.reference}`);
    return { updated: 0, skipped: sourceDatapoints.length };
  }

  // 4. Applica le modifiche su Mongo (o dry-run)
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const [surveyKey, dimList] of reorderMap.entries()) {
    console.log(`    Survey: ${surveyKey} — ${dimList.length} datapoint(s) da aggiornare`);

    if (DRY_RUN) {
      // Mostra un campione del prima/dopo
      const sample = dimList.slice(0, 3);
      for (const { original, reordered } of sample) {
        console.log(`      PRIMA:  [${original.join(", ")}]`);
        console.log(`      DOPO:   [${reordered.join(", ")}]`);
      }
      totalSkipped += dimList.length;
      continue;
    }

    // Bulk update: per ogni datapoint aggiorna solo il campo dimensions
    // matchando su survey (uppercase) e dimensions originale
    const bulkOps = [];
    for (const { original, reordered } of dimList) {
      bulkOps.push({
        updateOne: {
          filter: { survey: surveyKey, dimensions: original },
          update: { $set: { dimensions: reordered } },
        },
      });
    }

    // Esegui in batch
    for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
      const chunk = bulkOps.slice(i, i + BATCH_SIZE);
      const result = await mongoCollection.bulkWrite(chunk, { ordered: false });
      totalUpdated += result.modifiedCount;
    }
  }

  return { updated: totalUpdated, skipped: totalSkipped };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n--- Dimension Reorder ---`);
  console.log(`Modalità: ${DRY_RUN ? "🔍 DRY-RUN (nessuna modifica)" : "✏️  APPLY (aggiornamento reale)"}`);
  console.log(`Endpoint principale:    ${config.api.graphqlEndpoint}`);
  console.log(`Endpoint di riferimento: ${REFERENCE_ENDPOINT}\n`);

  // Carica pilots
  const rawData = await fs.readFile(config.paths.regionsFile, "utf-8");
  const pilotsList = JSON.parse(rawData);

  // Recupera i file GraphQL da GitHub
  console.log("[1/3] Recupero file GraphQL da GitHub...");
  const fileUrls = await githubService.getGraphQLFiles();
  console.log(`      Trovati ${fileUrls.length} file .graphql\n`);

  // Connessione Mongo
  let mongoClient, mongoCollection;
  if (!DRY_RUN) {
    console.log("[2/3] Connessione a MongoDB...");
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    mongoCollection = mongoClient.db(DB_NAME).collection(COLLECTION_NAME);
    console.log(`      Connesso a ${MONGO_URI} → ${DB_NAME}.${COLLECTION_NAME}\n`);
  } else {
    console.log("[2/3] Dry-run: connessione Mongo saltata\n");
  }

  console.log("[3/3] Elaborazione query...\n");

  let grandTotalUpdated = 0;
  let grandTotalSkipped = 0;

  try {
    for (let i = 0; i < fileUrls.length; i++) {
      const fileUrl = fileUrls[i];
      const fileName = fileUrl.split("/").pop();
      console.log(`--- File [${i + 1}/${fileUrls.length}]: ${fileName} ---`);

      let rawQuery;
      try {
        rawQuery = await githubService.getRawFile(fileUrl);
      } catch (err) {
        console.error(`  [ERROR] Download query fallito: ${err.message}`);
        continue;
      }

      // Applica lo stesso fix delle parentesi che usa etlProcessor
      const queryString = rawQuery.replace(
        /dimensions:\s*\$(\w+)/g,
        "dimensions: [$$$1]"
      );

      const executionPlan = etlProcessor._buildExecutionPlan(queryString, pilotsList);

      if (executionPlan.length === 0) {
        console.log(`  > Piano vuoto, saltato.\n`);
        continue;
      }

      console.log(`  > Piano: ${executionPlan.length} task(s)`);

      for (const task of executionPlan) {
        try {
          const { updated, skipped } = await processTask(
            task,
            queryString,
            mongoCollection
          );
          grandTotalUpdated += updated;
          grandTotalSkipped += skipped;
        } catch (err) {
          console.error(`  [ERROR] Task ${task.reference}: ${err.message}`);
        }
      }

      console.log();
    }
  } finally {
    if (mongoClient) {
      await mongoClient.close();
      console.log("Connessione MongoDB chiusa.");
    }
  }

  console.log(`\n=== COMPLETATO ===`);
  if (DRY_RUN) {
    console.log(`Datapoints analizzati (dry-run): ${grandTotalSkipped}`);
    console.log(`Lancia con --apply per applicare le modifiche.`);
  } else {
    console.log(`Dimensions aggiornate su Mongo: ${grandTotalUpdated}`);
  }
}

run().catch((err) => {
  console.error("CRASH:", err.message);
  process.exit(1);
});