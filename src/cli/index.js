const BatchManager = require('../service/BatchManager');
const { validateProductFormat } = require('../utils/specUtils');

async function runCli(inputArgs) {
  const args = inputArgs ;
  if (args.length < 5) {
    console.log('参数: "产品" "公司" "项目" 数量 "产品类型(大六角/扭剪)"');
    console.log('示例:  spec:"M16*45" company:"A公司" project:"B项目" num:1500 type:"扭剪"');
     if (!inputArgs) {
      console.log(msg);
      process.exit(1);
    } else {
      throw new Error(msg);
    }
  }

  const [product, company, project, countStr, productType] = args;
    // 校验
    if (!validateProductFormat(product)) {
        console.log('产品格式错误，正确示例：M16*45');
        process.exit(1);
    }
    // 螺栓类型校验
    if (!['扭剪','大六角'].includes(productType)) {
        console.log('目前仅支持：扭剪 / 大六角，后面还要扩展到焊钉');
        process.exit(1);
    }
    const count = parseInt(countStr);

    if (isNaN(count) || count <= 0) {
        console.log('数量必须是正整数');
        process.exit(1);
    }

    const bm = new BatchManager();
    const res = await bm.assignBatch(product, company, project, count, productType);

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
    return res.batchString;
    }

module.exports = { runCli };