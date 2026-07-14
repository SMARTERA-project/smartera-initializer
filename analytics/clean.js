const analytics = require("./analytics.not-cleaned.json");
const fs = require("fs");
const cleanedData = analytics.map((item) => {
  delete item._id; 
  return item;
});
fs.writeFileSync("cleaned_analytics.json", JSON.stringify(cleanedData), "utf8");
