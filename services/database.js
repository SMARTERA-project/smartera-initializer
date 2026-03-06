const { MongoClient } = require('mongodb');
const config = require('../config');

class DatabaseService {
  constructor() {
    this.client = new MongoClient(config.db.uri, {
      maxIdleTimeMS: 60000, 
      serverSelectionTimeoutMS: 60000,
    });
  }

  // Establishes the connection to the database
  async connect() {
    await this.client.connect();
    this.db = this.client.db(config.db.name);
    this.tempCollection = this.db.collection(config.db.tempCollection);
  }

  // Clears the temporary collection to avoid leftover data from previous failed runs
  async clearTempData() {
    await this.tempCollection.deleteMany({});
  }

  // Inserts an array of records into the temporary collection
  async insertTempData(data) {
    if (data && Array.isArray(data) && data.length > 0) {
      await this.tempCollection.insertMany(data);
      return data.length;
    }
    return 0;
  }

  // Performs a Zero-Downtime swap by renaming the temporary collection to the final one
  async swapCollections() {
    await this.tempCollection.rename(config.db.finalCollection, { dropTarget: true });
  }

  async close() {
    await this.client.close();
  }
}

module.exports = new DatabaseService();