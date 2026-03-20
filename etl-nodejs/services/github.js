const config = require('../config');

class GithubService {
  constructor() {
    this.headers = config.github.token ? { Authorization: `token ${config.github.token}` } : {};
  }

  // Recursively navigates the repository and finds all .graphql files
  async getGraphQLFiles(folderPath = config.github.folder) {
    const url = `https://api.github.com/repos/${config.github.owner}/${config.github.repo}/contents/${folderPath}`;
    
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API Error (${response.status}) on path '${folderPath}'. Details: ${errorText.substring(0, 100)}`);
    }
    
    const contents = await response.json();
    let files = [];

    for (const item of contents) {
      if (item.type === 'file' && item.name.endsWith('.graphql')) {
        files.push(item.download_url); // Store the raw URL for downloading later
      } else if (item.type === 'dir') {
        const subFiles = await this.getGraphQLFiles(item.path);
        files = files.concat(subFiles);
      }
    }
    return files;
  }

  // Downloads the raw text content of the GraphQL query
  async getRawFile(fileUrl) {
    const response = await fetch(fileUrl, { headers: this.headers });
    if (!response.ok) throw new Error(`Failed to download file from ${fileUrl}`);
    return await response.text();
  }
}

module.exports = new GithubService();