# 🔄 Smartera ETL Data Synchronizer

This repository contains the Node.js ETL (Extract, Transform, Load) script responsible for keeping the Smartera Data Dashboard up to date.

The script dynamically reads GraphQL queries from a remote GitHub repository, generates an execution plan based on the configured regions/villages, fetches the data from the main GraphQL API, and stores it in a local MongoDB database for the frontend to consume with zero-downtime swaps.

---

## 📂 Project Structure

- **`config.js`** - Centralized configuration and environment variables.
- **`ecosystem.config.example.js`** - PM2 configuration template.
- **`regions.json`** - Local configuration containing the parameters (NUTS codes, villages) for each pilot.
- **`services/`**
  - `github.js` - Handles GitHub API communication and file tree traversal.
  - `graphql.js` - Handles POST requests to the main GraphQL endpoint.
  - `database.js` - Manages MongoDB connections, data insertion, and collection swapping.
- **`core/etlProcessor.js`** - The brain of the ETL. Analyzes queries and generates the execution plan.
- **`index.js`** - The main orchestrator script.

---

## 🚀 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher recommended)
- **MongoDB** (Local, Dockerized, or Atlas)
- **PM2** (Process Manager for production deployment)

---

## 🛠️ Installation & Setup

### 1. Install Dependencies

Clone the repository and install the required MongoDB driver:

```bash
npm install mongodb
```

### 2. Setup the Configuration

Copy the example PM2 configuration file to create your own local copy:

```bash
cp ecosystem.config.example.js ecosystem.config.js
```

> ⚠️ **IMPORTANT:** Never commit `ecosystem.config.js` to version control! Ensure it is added to your `.gitignore`. Open the file and fill in your real credentials (GitHub Token, MongoDB URI, GraphQL Endpoint).

### 3. Setup the Regions Data

Ensure you have a `regions.json` file in the root directory. This file must contain the array of pilots and their respective villages/NUTS codes.

Example `regions.json`:

```json
[
  {
    "name": "valle-di-sole",
    "pilot": "P1",
    "pilot_nuts1": "Nord-Est",
    "villages": [
      "P1 - Valle di Sole - Caldes",
      "P1 - Valle di Sole - Cavizzana"
    ]
  }
]
```

---

## 💻 Running the Application

### Development / Manual Run

To run the script once manually and see the output directly in your terminal:

```bash
node index.js
```

### Production (Automated via PM2)

To run the script in the background and schedule it to run automatically (e.g., every night), use PM2.

**1. Install PM2 globally** (if not already installed):

```bash
npm install -g pm2
```

**2. Start the process** using the config file:

```bash
pm2 start ecosystem.config.js
```

---

## 📊 Monitoring Logs

When running via PM2, the script executes in the background. You can monitor its progress and check for errors using the following commands:

- **View real-time logs:**

```bash


```

- **View only errors:**

```bash
pm2 logs smartera-etl-sync --err
```

- **Clear old logs** to save disk space:

```bash
pm2 flush
```