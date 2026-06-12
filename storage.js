const fs = require('fs');
const path = require('path');

// history.json
const historyPath = path.join(__dirname, 'history.json');

function saveHistory(data) {
  let history = { records: [] };
  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch (e) {}
  }
  history.records.push({
    ...data,
    actionTime: new Date().toLocaleString()
  });
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
}
// inuse.json
const inusePath = path.join(__dirname, 'inuse.json');
function loadInuse() {
    if (!fs.existsSync(inusePath)) return { list: [] };
    return JSON.parse(fs.readFileSync(inusePath, 'utf8'));
}
function saveInuse(data) {
    fs.writeFileSync(inusePath, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
    saveHistory,
    loadInuse,
    saveInuse
};