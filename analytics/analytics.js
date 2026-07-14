const { getCollection, closeConnection } = require("./connect-to-mongo");
const analytics = require("./analytics.json");

const COLLECTION_NAME = process.env.COLLECTION_NAME || "datapoints";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27037";
const DB_NAME = process.env.DB_NAME || "analytics_db";

async function insertAnalyticsData() {
    const datapoints = await getCollection(COLLECTION_NAME, MONGO_URI, DB_NAME);
    await datapoints.deleteMany({"source": "AT-SSCH"});
    await datapoints.insertMany(analytics);
    console.log(`Inserted ${analytics.length} documents into the '${COLLECTION_NAME}' collection.`);
    await closeConnection();
}

insertAnalyticsData().catch(console.error);