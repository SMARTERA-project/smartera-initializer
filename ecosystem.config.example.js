// ecosystem.config.example.js
// TEMPLATE FILE: Copy this file to 'ecosystem.config.js' and fill in your real credentials.
// DO NOT commit the real 'ecosystem.config.js' to version control!

module.exports = {
  apps: [
    {
      name: "smartera-etl-sync",
      script: "./index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      cron_restart: "0 3 * * *", // Runs every night at 3:00 AM
      env: {
        NODE_ENV: "development",
        GITHUB_OWNER: "SMARTERA-project",
        GITHUB_REPO: "data-dashboard",
        GITHUB_FOLDER: "fe/src/api/graphql/queries",
        GITHUB_TOKEN: "YOUR_GITHUB_PERSONAL_ACCESS_TOKEN_HERE",
        GRAPHQL_ENDPOINT: "https://api.yourdomain.com/graphql",
        MONGO_URI: "mongodb://admin:password@localhost:27017/?authSource=admin",
      }
    }
  ]
};