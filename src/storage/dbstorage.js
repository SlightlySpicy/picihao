const { query } = require('../config/db');

// ====================== 替代 loadInuse / saveInuse ======================
// 查询全部在用批次
async function loadInuse() {
  const list = await query('SELECT * FROM tb_inuse_batch');
  // json字段转数组对象，和原json数据结构对齐
  list.forEach(item => {
    item.specNames = JSON.parse(item.spec_names);
    item.specLengths = JSON.parse(item.spec_lengths);
    delete item.spec_names;
    delete item.spec_lengths;
  });
  return { list };
}

// 覆盖更新全部在用批次（业务逻辑：全量覆盖原有库存）
async function saveInuse(data) {
  // 1. 清空原有库存
  await query('TRUNCATE TABLE tb_inuse_batch');
  const batchList = data.list || [];
  if (batchList.length === 0) return;
  // 批量插入
  const insertSql = `
    INSERT INTO tb_inuse_batch
    (batch_no,seq,product,company,project,product_type,total_capacity,remaining,spec_names,spec_lengths,create_time)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `;
  for (const item of batchList) {
    await query(insertSql, [
      item.batchNo,
      item.seq,
      item.product,
      item.company,
      item.project,
      item.productType,
      item.totalCapacity,
      item.remaining,
      JSON.stringify(item.specNames),
      JSON.stringify(item.specLengths),
      item.createTime
    ]);
  }
}

// ====================== 替代 saveHistory ======================
async function saveHistory(data) {
  const sql = `
    INSERT INTO tb_batch_history
    (batch_no,product,company,project,product_type,total_capacity,use_count,remaining,status,action,action_time)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `;
  await query(sql, [
    data.batchNo,
    data.product,
    data.company,
    data.project,
    data.productType,
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
    INSERT INTO tb_apply_record
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