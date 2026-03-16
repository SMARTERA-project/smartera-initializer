const config = require('../config');

class GraphqlService {
  // Sends the POST request to the remote GraphQL server
  async executeQuery(queryString, variables = undefined) {
    const payload = { query: queryString };
    if (variables) {
      payload.variables = variables;
    }

    const response = await fetch(config.api.graphqlEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP Error ${response.status}. Dettagli dal server: ${errorText}`);
    }

    const result = await response.json();
    console.log(`\n  > graphqlService.executeQuery  result -> ${JSON.stringify(result.data)} `);
    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    return result.data;
  }
}

module.exports = new GraphqlService();