const fs = require('fs');
const path = require('path');
const historyPath = path.join(__dirname, '../../recordSaveintoDB/history.json');

// 保存批次操作历史
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

module.exports = { saveHistory };