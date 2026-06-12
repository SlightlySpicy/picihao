const fs = require('fs');
const path = require('path');
const inusePath = path.join(__dirname, '../../recordSaveintoDB/inuse.json');

// 加载在用批次
function loadInuse() {
  if (!fs.existsSync(inusePath)) return { list: [] };
  return JSON.parse(fs.readFileSync(inusePath, 'utf8'));
}

// 保存在用批次
function saveInuse(data) {
  fs.writeFileSync(inusePath, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { loadInuse, saveInuse };