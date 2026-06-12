const BatchManager = require('../service/BatchManager');

async function runCli() {
  const args = process.argv.slice(2);
  if (args.length < 5) {
    console.log('用法: node index.js "产品" "公司" "项目" 数量 "产品类型(大六角/扭剪)"');
    console.log('示例: node index.js "M16*45" "A公司" "B项目" 1500 "扭剪"');
    process.exit(1);
  }

  const [product, company, project, countStr, productType] = args;
  const count = parseInt(countStr);

  if (isNaN(count) || count <= 0) {
    console.log('数量必须是正整数');
    process.exit(1);
  }

  const bm = new BatchManager();
  const res = bm.assignBatch(product, company, project, count, productType);

  console.log('\n================================');
  console.log('产品：', product);
  console.log('公司：', company);
  console.log('项目：', project);
  console.log('申请数量：', count);
  console.log('产品类型：', productType);
  console.log('--------------------------------');
  res.batches.forEach((item, i) => {
    console.log(`${i+1}. ${item.batchNo} | 使用：${item.useCount} | 剩余：${item.remainingInBatch} | ${item.from}`);
  });
  console.log('--------------------------------');
  console.log('最终批次号：', res.batchString);
  console.log('================================\n');
}

module.exports = { runCli };