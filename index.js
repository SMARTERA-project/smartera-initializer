const fs = require("fs").promises;
const config = require("./config");
const githubService = require("./services/github");
const dbService = require("./services/database");
const etlProcessor = require("./core/etlProcessor");

async function start() {
  try {
    console.log("\n\n--- Starting ETL Data Synchronization Process ---");

    // 1. Load regional configuration
    console.log("\n[1/4] Loading regional data (regions.json)...");
    const rawData = await fs.readFile(config.paths.regionsFile, "utf-8");
    const pilotsList = JSON.parse(rawData);
    console.log(`      Found ${pilotsList.length} configured pilots.`);

    // 2. Scan GitHub for queries
    console.log(
      `\n[2/4] Scanning GitHub repository (${config.github.folder})...`
    );
    const fileUrls = await githubService.getGraphQLFiles();
    console.log(
      `      Found ${fileUrls.length} .graphql files ready for execution.`
    );

    // 3. Setup Database
    console.log(
      "\n[3/4] Connecting to database and clearing temporary area..."
    );
    const isCacheOnly = config.db.cacheOnly;
    if (!isCacheOnly) {
      await dbService.connect();
      await dbService.clearTempData();
    }

    // 4. Run ETL Process
    console.log("\n[4/4] Starting query processing...");
    let totalFilesSuccess = 0;
    let totalFilesFailed = 0;

    for (let i = 0; i < 2; i++) {
      const fileUrl = fileUrls[i];
      console.log(`\n--- Processing [${i + 1}/${fileUrls.length}] ---`);
      console.log(`File: ${fileUrl.split("/").pop()}`);

      try {
        const queryString = await githubService.getRawFile(fileUrl);
        await etlProcessor.processQueryFile(fileUrl, queryString, pilotsList);
        totalFilesSuccess++;
      } catch (error) {
        console.error(`CRITICAL ERROR on file: ${error.message}`);
        totalFilesFailed++;
      }
    }

    // 5. Final Database Swap
    console.log("\n--- Executing Zero-Downtime Collection Swap ---");
    await dbService.swapCollections();

    // Summary
    console.log(`\n=== SYNCHRONIZATION COMPLETED ===`);
    console.log(`Successfully processed files: ${totalFilesSuccess}`);
    console.log(`Failed files: ${totalFilesFailed}`);
  } catch (globalError) {
    console.error("\n MAIN PROCESS CRASHED:", globalError.message);
  } finally {
    await dbService.close();
    console.log("Database connection closed.");
  }
}

// Start execution
start();
