const path = require('path');

// Centralized configuration file
module.exports = {
  github: {
    owner: process.env.GITHUB_OWNER || 'SMARTERA-project',
    repo: process.env.GITHUB_REPO || 'data-dashboard',
    folder: process.env.GITHUB_FOLDER || 'fe/src/api/graphql/queries',
    token: process.env.GITHUB_TOKEN || ''
  },
  api: {
    graphqlEndpoint: process.env.GRAPHQL_ENDPOINT || 'https://INSERT_REAL_URL_HERE/graphql'
  },
  db: {
    uri: process.env.MONGO_URI || 'mongodb://localhost:27037',
    name: 'frontend_db',
    finalCollection: 'smartness_data',
    tempCollection: 'smartness_data_temp',
    cacheOnly: process.env.CACHE_ONLY || false
  },
  paths: {
    regionsFile: path.join(__dirname, 'regions.json')
  }
};