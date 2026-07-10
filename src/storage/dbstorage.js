const { pool, query } = require('../config/db');
const { filterXSS } = require('../utils/validateUtil');
const { formatMysqlTime } = require('../utils/formatUtils');

/**
 * 按月获取下一个序列号，每月独立自增，新月份自动从1开始
 * @param {string} yearMonth 6位年月 2607
 * @returns {Promise<number>} 自增后seq
 */
async function getNextBatchSeq(yearMonth) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // 行锁锁定当前年月记录，防止并发同时读取
    const selectSql = "SELECT max_seq FROM batch_seq WHERE yearmonth = ? FOR UPDATE";
    let [rows] = await conn.execute(selectSql, [yearMonth]);
    let nextSeq;
    if (rows.length === 0) {
      // 无记录，初始化1
      await conn.execute("INSERT INTO batch_seq (yearmonth, max_seq) VALUES (?, ?)", [yearMonth, 1]);
      nextSeq = 1;
    } else {
      // 存在则+1更新
      const curr = rows[0].max_seq;
      nextSeq = curr + 1;
      await conn.execute("UPDATE batch_seq SET max_seq = ? WHERE yearmonth = ?", [nextSeq, yearMonth]);
    }
    await conn.commit();
    return nextSeq;
  } catch (e) {
    await conn.rollback();
    throw new Error(`序列号生成失败:${e.message}`);
  } finally {
    conn.release();
  }
}

/**
 * 根据四元组(公司/项目/类型/完整规格)查询绑定的批次库存
 * @param {string} c
 * @param {string} p
 * @param {string} t
 * @param {string} specFull M16*90
 * @returns {Promise<Object|null>} {batchNo, totalCapacity, remaining, specX, specLen}
 */
async function getBizRel(c, p, t, specFull) {
  const sql = `
    SELECT r.batch_no, s.total_capacity, s.remaining, r.spec_x, r.spec_len
    FROM batch_spec r
    JOIN batch_inuse s ON r.batch_no = s.batch_no
    WHERE r.company=? AND r.project=? AND r.product_type=? AND r.spec_full=?
  `;
  const rows = await query(sql, [filterXSS(c), filterXSS(p), filterXSS(t), filterXSS(specFull)]);
  if (!rows.length) return null;
  return rows[0];
}

/**
 * 查询同公司+项目+类型+直径下所有在用批次（复用匹配候选）
 */
async function listBizRelByX(c, p, t, targetX) {
  const sql = `
    SELECT DISTINCT r.batch_no, s.remaining
    FROM batch_spec r
    JOIN batch_inuse s ON r.batch_no = s.batch_no
    WHERE r.company=? AND r.project=? AND r.product_type=? AND r.spec_x=? AND s.remaining > 0
  `;
  return await query(sql, [filterXSS(c), filterXSS(p), filterXSS(t), targetX]);
}

/**
 * 根据批次号查询批次库存详情
 */
async function getStockByBatchNo(batchNo) {
  const sql = `SELECT * FROM batch_inuse WHERE batch_no=?`;
  const rows = await query(sql, [filterXSS(batchNo)]);
  return rows[0] || null;
}

/**
 * 复用批次：扣减库存，追加规格绑定
 * @param {string} batchNo
 * @param {number} useNum
 * @param {string} company
 * @param {string} project
 * @param {string} productType
 * @param {string} specFull
 * @param {number} specX
 * @param {number} specLen
 */
async function reuseStock(batchNo, useNum, company, project, productType, specFull, specX, specLen) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // 1. 扣减库存
    await conn.execute(`
      UPDATE batch_inuse SET remaining = remaining - ? WHERE batch_no=?
    `, [useNum, filterXSS(batchNo)]);
    // 2. 当前规格未绑定该批次则新增关联记录
    const existRel = await conn.execute(`
      SELECT id FROM batch_spec WHERE company=? AND project=? AND product_type=? AND spec_full=?
    `, [filterXSS(company), filterXSS(project), filterXSS(productType), filterXSS(specFull)]);
    if (!existRel[0].length) {
      await conn.execute(`
        INSERT INTO batch_spec (company,project,product_type,spec_full,spec_x,spec_len,batch_no)
        VALUES (?,?,?,?,?,?,?)
      `, [
        filterXSS(company), filterXSS(project), filterXSS(productType),
        filterXSS(specFull), specX, specLen, filterXSS(batchNo)
      ]);
    }
    // 3. 扣减后库存为0，清理所有关联+删除批次
    const stock = await getStockByBatchNo(batchNo);
    if (stock.remaining - useNum <= 0) {
      await conn.execute(`DELETE FROM batch_spec WHERE batch_no=?`, [filterXSS(batchNo)]);
      await conn.execute(`DELETE FROM batch_inuse WHERE batch_no=?`, [filterXSS(batchNo)]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * 新建物理批次，同时绑定当前规格
 */
async function createStockBatch(yearMonth, totalCap, remain, company, project, productType, specFull, specX, specLen, createTime) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // 1. 事务内原子获取下一个seq，失败整体回滚，seq不会乱涨
    const [seqRow] = await conn.execute("SELECT max_seq FROM batch_seq WHERE yearmonth = ? FOR UPDATE", [yearMonth]);
    let newSeq;
    if(seqRow.length === 0) {
      await conn.execute("INSERT INTO batch_seq (yearmonth, max_seq) VALUES (?, 1)", [yearMonth]);
      newSeq = 1;
    } else {
      const currMax = seqRow[0].max_seq;
      newSeq = currMax + 1;
      await conn.execute("UPDATE batch_seq SET max_seq = ? WHERE yearmonth = ?", [newSeq, yearMonth]);
    }
    const seqStr = String(newSeq).padStart(4, '0');
    const batchNo = `${yearMonth}${seqStr}`;

    // 2. 校验批次号防并发重复
    const [existBatch] = await conn.execute("SELECT 1 FROM batch_inuse WHERE batch_no = ?", [batchNo]);
    if (existBatch.length > 0) throw new Error('DUPLICATE_BATCH_NO');

    // 3. 查询当前业务绑定的旧在用批次
    const [oldSpecRow] = await conn.execute(`
      SELECT s.batch_no FROM batch_spec s
      WHERE s.company=? AND s.project=? AND s.product_type=? AND s.spec_full=?
    `, [company, project, productType, specFull]);

    // 4. 如果存在旧在用批次：归档到history，删除inuse旧数据
    if (oldSpecRow.length > 0) {
      const oldBatchNo = oldSpecRow[0].batch_no;
      // 把旧批次库存归档历史
      await conn.execute(`
      INSERT INTO history (batch_no,product,company,project,product_type,total_capacity,use_count,remaining,status,action,action_time)
      SELECT batch_no,?, ?, ?, ?, total_capacity, 0, remaining, 'used', '过期切换新批次', NOW()
      FROM batch_inuse WHERE batch_no = ?
      `, [specFull, company, project, productType, oldBatchNo]);
      // 删除旧在用批次（inuse只留最新）
      await conn.execute("DELETE FROM batch_inuse WHERE batch_no = ?", [oldBatchNo]);
    }

    // 5. 插入全新在用批次到 batch_inuse（仅存最新）
    await conn.execute(`
      INSERT INTO batch_inuse (batch_no,seq,total_capacity,remaining,create_time)
      VALUES (?,?,?,?,?)
    `, [batchNo, newSeq, totalCap, remain, createTime]);

    // 6. 更新 batch_spec，永远只保留一行，不INSERT避免唯一键冲突
    if (oldSpecRow.length === 0) {
      // 无历史，首次插入
      await conn.execute(`
        INSERT INTO batch_spec (company,project,product_type,spec_full,spec_x,spec_len,batch_no,update_time)
        VALUES (?,?,?,?,?,?,?,NOW())
      `, [company, project, productType, specFull, specX, specLen, batchNo]);
    } else {
      // 已有记录，UPDATE指向新批次，不新增行
      await conn.execute(`
        UPDATE batch_spec SET batch_no=?, update_time=NOW()
        WHERE company=? AND project=? AND product_type=? AND spec_full=?
      `, [batchNo, company, project, productType, specFull]);
    }

    await conn.commit();
    return batchNo;
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY' || e.message === 'DUPLICATE_BATCH_NO') {
      throw new Error('DUPLICATE_BATCH_NO');
    }
    throw e;
  } finally {
    conn.release();
  }
}

// 历史记录、批次记录表逻辑不变，保留
async function saveHistory(data) {
  const sql = `
    INSERT INTO history
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
    formatMysqlTime()
  ]);
}
async function savePiciRecord(product, company, project, totalNum, batchStr) {
  const sql = `
    INSERT INTO record
    (company,project,product,batch_string,total_count,create_time)
    VALUES (?,?,?,?,?,?)
  `;
  await query(sql, [company, project, product, batchStr, totalNum, formatMysqlTime()]);
}

// 导出新API，废弃loadInuse/saveInuse
module.exports = {
  getBizRel,
  listBizRelByX,
  getStockByBatchNo,
  reuseStock,
  createStockBatch,
  saveHistory,
  savePiciRecord,
  getNextBatchSeq
};