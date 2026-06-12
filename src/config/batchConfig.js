const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, '../../config.js');

// 配置
const BATCH_CONFIG = {
  YEAR: new Date().getFullYear().toString().slice(-2),
  MONTH: new Date().getMonth() + 1,
  BATCH_CAPACITY: 3000,
  SEQ_START: 46,
  ALLOW_LENGTH_DIFF_100: 15,
  ALLOW_LENGTH_DIFF_OVER100: 20
};

// 自动更新 SEQ_START 到 config.js
function saveBatchConfig(newConfig) {
  try {
    let content = fs.readFileSync(configPath, 'utf8');
    content = content.replace(/SEQ_START:\s*\d+/, `SEQ_START: ${newConfig.SEQ_START}`);
    fs.writeFileSync(configPath, content, 'utf8');
  } catch (err) {
    console.error('更新 config 失败', err);
  }
}

module.exports = { BATCH_CONFIG, saveBatchConfig };