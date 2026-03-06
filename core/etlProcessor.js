const graphqlService = require('../services/graphql');
const dbService = require('../services/database');

class ETLProcessor {
  
  // 1. Parses the query text to identify required variables
  _analyzeQueryRequirements(queryString) {
    return {
      needsNuts1: queryString.includes('$pilot_nuts1'),
      needsNuts2: queryString.includes('$pilot_nuts2'),
      needsNuts3: queryString.includes('$pilot_nuts3'),
      needsPilot: queryString.includes('$pilot'),
      needsVillage: queryString.includes('$village'),
    };
  }

  // 2. Builds a list of execution Tasks (Execution Plan) based on region data
  _buildExecutionPlan(queryString, pilotsList) {
    const reqs = this._analyzeQueryRequirements(queryString);
    const isParametric = reqs.needsNuts1 || reqs.needsNuts2 || reqs.needsNuts3 || reqs.needsPilot || reqs.needsVillage;
    
    const plan = [];

    // If no parameters are required, generate a single global task
    if (!isParametric) {
      plan.push({ variables: undefined, reference: 'global' });
      return plan;
    }

    // If parametric, cross-reference with the regions/pilots JSON to generate specific tasks
    for (const pilot of pilotsList) {
      
      // Case A: Query requires fine-grained village data
      if (reqs.needsVillage) {
        if (!pilot.villages || pilot.villages.length === 0) continue;
        
        for (const village of pilot.villages) {
          let vars = { village: village };
          
          if (reqs.needsNuts1 && pilot.pilot_nuts1) vars.pilot_nuts1 = pilot.pilot_nuts1;
          if (reqs.needsNuts2 && pilot.pilot_nuts2) vars.pilot_nuts2 = pilot.pilot_nuts2;
          if (reqs.needsNuts3 && pilot.pilot_nuts3) vars.pilot_nuts3 = pilot.pilot_nuts3;
          if (reqs.needsPilot && pilot.pilot) vars.pilot = pilot.pilot;
          
          plan.push({ variables: vars, reference: village }); // Village name acts as the reference
        }
      } 
      // Case B: Query requires pilot/region level data
      else {
        let vars = {};
        let missingParams = false;

        if (reqs.needsNuts1) { if (pilot.pilot_nuts1) vars.pilot_nuts1 = pilot.pilot_nuts1; else missingParams = true; }
        if (reqs.needsNuts2) { if (pilot.pilot_nuts2) vars.pilot_nuts2 = pilot.pilot_nuts2; else missingParams = true; }
        if (reqs.needsNuts3) { if (pilot.pilot_nuts3) vars.pilot_nuts3 = pilot.pilot_nuts3; else missingParams = true; }
        if (reqs.needsPilot) { if (pilot.pilot) vars.pilot = pilot.pilot; else missingParams = true; }

        if (!missingParams) {
          plan.push({ variables: vars, reference: pilot.name }); // Pilot name acts as the reference
        }
      }
    }

    return plan;
  }

  // 3. Executes a single GraphQL file by processing its entire execution plan
  async processQueryFile(fileUrl, rawQueryString, pilotsList) {
    const queryString = rawQueryString.replace(/dimensions:\s*\$(\w+)/g, 'dimensions: [$$$1]');
    const executionPlan = this._buildExecutionPlan(queryString, pilotsList);
    let successCount = 0;
    
    if (executionPlan.length === 0) {
       console.log(`  > No executable tasks generated (missing parameters in regions.json). Skipped.`);
       return { success: 0, fail: 0 };
    }

    console.log(`  > Generated execution plan with ${executionPlan.length} calls.`);

    for (const task of executionPlan) {
      try {
        const data = await graphqlService.executeQuery(queryString, task.variables);
        
        // Extract the actual data array from the GraphQL response object
        let dataToSave = data ? Object.values(data)[0] : null;

        if (dataToSave && Array.isArray(dataToSave) && dataToSave.length > 0) {
          // Append the reference (foreign key) so the frontend can query it easily
          dataToSave = dataToSave.map(doc => ({
            ...doc,
            _pilot_reference: task.reference 
          }));

          const inserted = await dbService.insertTempData(dataToSave);
          successCount++;
          console.log(`    [OK] Saved ${inserted} rows for: ${task.reference}`);
        }
      } catch (error) {
        console.error(`    [ERROR] Execution failed for ${task.reference}:`, error.message);
        throw error; // Rethrow to count this file as failed
      }
    }

    return { success: successCount, fail: 0 };
  }
}

module.exports = new ETLProcessor();