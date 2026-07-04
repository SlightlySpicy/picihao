const { pool, query } = require('../config/db');
const { filterXSS } = require('../utils/validateUtil');
// ====================== 替代 loadInuse / saveInuse ======================
// 查询全部在用批次
async function loadInuse() {
  const list = await query('SELECT * FROM bolt_inuse');
  // json字段转数组对象，和原json数据结构对齐
  list.forEach(item => {
    item.specNames = JSON.parse(JSON.stringify(item.spec_names));
    item.specLengths = JSON.parse(JSON.stringify(item.spec_lengths));
    delete item.spec_names;
    delete item.spec_lengths;
  });
  return { list };
}

async function saveInuse(data) {
  // 仅从data取出批次数组，业务维度从第一条item读取
  const batchList = data.list || [];
  if (batchList.length === 0) return;

  // 取第一条数据作为本次操作的过滤条件（同次请求所有批次业务维度一致）
  const firstItem = batchList[0];
  const filterCompany = firstItem.company;
  const filterProject = firstItem.project;
  const filterProductType = firstItem.productType;
  const filterProduct = firstItem.product;

  // 获取事务专属连接
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const updateBatchList = [];
    const insertBatchList = [];
    const existBatchNos = new Set();

    // 1. 查询当前【公司+项目+产品类型】下数据库已存在的所有批次号
    const [existRows] = await conn.execute(
      'SELECT batch_no FROM bolt_inuse WHERE company=? AND project=? AND product_type=? AND product=?',
      [filterXSS(filterCompany), filterXSS(filterProject), filterXSS(filterProductType), filterXSS(filterProduct)]
    );
    existRows.forEach(row => existBatchNos.add(row.batch_no));

    // 区分：数据库已有批次→更新；全新批次→插入
    for (const item of batchList) {
      if (existBatchNos.has(item.batchNo)) {
        updateBatchList.push(item);
      } else {
        insertBatchList.push(item);
      }
    }

    // 2. 条件删除：当前业务维度下，已经用完的批次（剩余量=0）
    await conn.execute(`
      DELETE FROM bolt_inuse 
      WHERE company=? AND project=? AND product_type=? AND product=? AND remaining=0
    `, [filterXSS(filterCompany), filterXSS(filterProject), filterXSS(filterProductType), filterXSS(filterProduct)]);

    // 3. 更新存量批次：仅更新剩余数量、规格数组
    const updateSql = `
      UPDATE bolt_inuse
      SET remaining=?, spec_names=?, spec_lengths=?
      WHERE batch_no=?
    `;
    for (const item of updateBatchList) {
      await conn.execute(updateSql, [
        item.remaining,
        JSON.stringify(filterXSS(item.specNames)),
        JSON.stringify(filterXSS(item.specLengths)),
        filterXSS(item.batchNo)
      ]);
    }

    // 4. 插入全新批次，字段顺序、filterXSS逻辑和你旧代码完全对齐
    const insertSql = `
      INSERT INTO bolt_inuse
      (batch_no,seq,product,company,project,product_type,total_capacity,remaining,spec_names,spec_lengths,create_time)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `;
    for (const item of insertBatchList) {
      await conn.execute(insertSql, [
        filterXSS(item.batchNo),
        item.seq,
        filterXSS(item.product),
        filterXSS(item.company),
        filterXSS(item.project),
        filterXSS(item.productType),
        item.totalCapacity,
        item.remaining,
        JSON.stringify(filterXSS(item.specNames)),
        JSON.stringify(filterXSS(item.specLengths)),
        item.createTime
      ]);
    }

    // 全部操作无异常，提交事务
    await conn.commit();
  } catch (err) {
    // 任意报错，回滚本次所有数据库操作，不会清空整张表
    await conn.rollback();
    console.error('saveInuse事务异常，已自动回滚数据：', err);
    throw err; // 向上抛出异常，接口捕获返回错误
  } finally {
    // 释放连接回连接池，防止连接泄露
    conn.release();
  }
}


// ====================== 替代 saveHistory ======================
async function saveHistory(data) {
  const sql = `
    INSERT INTO bolt_his
    (batch_no,product,company,project,product_type,total_capacity,use_count,remaining,status,action,action_time)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `;
  await query(sql, [
    filterXSS(data.batchNo),
    filterXSS(data.product),
    filterXSS(data.company),
    filterXSS(data.project),
    filterXSS(data.productType),
    data.totalCapacity,
    data.useCount,
    data.remaining,
    data.status,
    data.action,
    new Date().toLocaleString()
  ]);
}

// ====================== 替代 savePiciRecord ======================
async function savePiciRecord(product, company, project, totalNum, batchStr) {
  const sql = `
    INSERT INTO bolt_rec
    (company,project,product,batch_string,total_count,create_time)
    VALUES (?,?,?,?,?,?)
  `;
  await query(sql, [company, project, product, batchStr, totalNum, new Date().toLocaleString()]);
}

module.exports = {
  loadInuse,
  saveInuse,
  saveHistory,
  savePiciRecord
};