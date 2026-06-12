const fs = require('fs');
const path = require('path');
const picihaoPath = path.join(__dirname, '../../recordSaveintoDB/picihao.json');

// 保存批次记录
function savePiciRecord(product, company, project, totalNum, batchStr) {
  let arr = [];
  if (fs.existsSync(picihaoPath)) {
    arr = JSON.parse(fs.readFileSync(picihaoPath, 'utf8'));
  }
  arr.push({
    company,
    project,
    product,
    batchString: batchStr,
    totalCount: totalNum,
    createTime: new Date().toLocaleString()
  });
  fs.writeFileSync(picihaoPath, JSON.stringify(arr, null, 2), 'utf8');
}

module.exports = { savePiciRecord };