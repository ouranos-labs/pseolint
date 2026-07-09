const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'serp-analysis-results.json');
try {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const beforeCount = data.queries.length;
  // Keep only successfully completed ones
  data.queries = data.queries.filter(q => q.landscape !== null);
  const afterCount = data.queries.length;
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`Filtered successfully! Cleaned out ${beforeCount - afterCount} failed queries. Keep ${afterCount} successful ones.`);
} catch (err) {
  console.error("Error filtering:", err.message);
}
