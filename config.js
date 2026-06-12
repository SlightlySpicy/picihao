const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, 'config.js');

const BATCH_CONFIG = {
  YEAR: new Date().getFullYear().toString().slice(-2),  // 当前年份
  MONTH:new Date().getMonth() + 1,
  BATCH_CAPACITY: 3000,    // 每批次容量
  SEQ_START: 9,// 全局所有产品/公司/项目共用的最大批次序号
  ALLOW_LENGTH_DIFF_100: 15,
  ALLOW_LENGTH_DIFF_OVER100: 20
};

// 自动更新 SEQ_START 到 config.js
function saveBatchConfig(newConfig) {
  try {
    let content = fs.readFileSync(configPath, 'utf8');
    // 正则匹配 SEQ_START 并自动更新
    content = content.replace(/SEQ_START:\s*\d+/, `SEQ_START: ${newConfig.SEQ_START}`);
    fs.writeFileSync(configPath, content, 'utf8');
  } catch (err) {
    console.error('更新 config 失败', err);
  }
}

module.exports = { BATCH_CONFIG, saveBatchConfig };