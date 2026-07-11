// 批次管理核心类
const { getBizRel, listBizRelByX, getStockByBatchNo, reuseStock, createStockBatch, saveHistory, savePiciRecord, getNextBatchSeq } = require('../storage/dbstorage');
const { BATCH_CONFIG } = require('../config/batchConfig');
const { isBatchExpired, isLengthMatch, canJoinBatch, updateBatchSpecs } = require('../utils/batchUtils');
const { getSpecX, getSpecLength } = require('../utils/specUtils');
const { formatBatchString , formatMysqlTime } = require('../utils/formatUtils');
const { query } = require('../config/db');
const { isExperimentStatusMatch } = require('../utils/specUtils');
// const { act } = require('react');

class BatchManager {
  constructor() {
    const { YEAR, MONTH, BATCH_CAPACITY, SEQ_START } = BATCH_CONFIG;
    
    // 基础属性
    this.currentYear = parseInt(YEAR);
    this.currentMonth = parseInt(MONTH);
    this.yearStr = YEAR;
    this.monthStr = String(MONTH).padStart(2, '0');
    this.BATCH_CAPACITY = BATCH_CAPACITY;
    // this.globalMaxSeq = SEQ_START;

    }

  // 分配批次核心方法
  async assignBatch(product, company, project, count, productType) {
  const targetX = getSpecX(product);
  const targetLen = getSpecLength(product);
  let remainingNeed = count;
  const result = [];
  // 步骤1：先查当前规格已绑定的批次
  const currentBind = await getBizRel(company, project, productType, product);
  if (currentBind && currentBind.remaining > 0) {
    // 直接复用当前规格绑定的批次
    const use = Math.min(remainingNeed, currentBind.remaining);
    result.push({
      batchNo: currentBind.batch_no,
      useCount: use,
      remainingInBatch: currentBind.remaining - use,
      from: '复用(当前规格绑定批次)'
    });
    // 持久扣减库存+绑定规格（幂等，已存在不重复插入rel）
    await reuseStock(
      currentBind.batch_no, use,
      company, project, productType,
      product, targetX, targetLen
    );
    // 写入历史记录
    saveHistory({
      batchNo: currentBind.batch_no,
      product, company, project, productType,
      totalCapacity: currentBind.total_capacity,
      useCount: use,
      remaining: currentBind.remaining - use,
      status: currentBind.remaining - use > 0 ? 'inuse' : 'used',
      action: '复用(当前规格绑定批次)'
    });
    remainingNeed -= use;
  }

  // 步骤2：当前规格无绑定批次，查询同公司/项目/类型/直径所有在用批次做通用复用
  if (remainingNeed > 0) {
    const candidateBatchNos = await listBizRelByX(company, project, productType, targetX);
    // 按批次平均长度与目标差值升序排序（原有排序逻辑保留）
    const candidateStocks = [];
    for (const item of candidateBatchNos) {
      const stock = await getStockByBatchNo(item.batch_no);
      // 取该批次下所有规格长度用于公差判断
      const lenRows = await query(`
        SELECT spec_len FROM batch_spec WHERE batch_no=?
      `, [stock.batch_no]);
      const lens = lenRows.map(r => r.spec_len);
      const avgLen = lens.reduce((s, v) => s + v, 0) / lens.length;
      candidateStocks.push({
        ...stock,
        avgLen,
        allLen: lens,
        batchNo: stock.batch_no
      });
    }
    candidateStocks.sort((a, b) => Math.abs(a.avgLen - targetLen) - Math.abs(b.avgLen - targetLen));

    // 两轮复用逻辑简化（统一循环候选批次，删除分散newInuseList操作）
    for (const stockItem of candidateStocks) {
      if (remainingNeed <= 0) break;
      const canUse = this._checkBatchCanJoin(
        stockItem.batchNo, product, company, project, productType, targetLen, stockItem.allLen
      );
      if (!canUse) continue;
      const use = Math.min(remainingNeed, stockItem.remaining);
      result.push({
        batchNo: stockItem.batchNo,
        useCount: use,
        remainingInBatch: stockItem.remaining - use,
        from: '复用(同直径匹配批次)'
      });
      await reuseStock(
        stockItem.batchNo, use,
        company, project, productType,
        product, targetX, targetLen
      );
      saveHistory({
        batchNo: stockItem.batchNo,
        product, company, project, productType,
        totalCapacity: stockItem.total_capacity,
        useCount: use,
        remaining: stockItem.remaining - use,
        status: stockItem.remaining - use > 0 ? 'inuse' : 'used',
        action: '复用(同直径匹配批次)'
      });
      remainingNeed -= use;
    }
  }

  // 步骤3：剩余需求新建批次
  if (remainingNeed > 0) {
    await this._createNewBatch(remainingNeed, product, company, project, productType, targetX, targetLen, result);
  }

  // 批次字符串格式化、记录入库
  const batchStr = formatBatchString(result, this.yearStr, this.BATCH_CAPACITY);
  savePiciRecord(product, company, project, count, batchStr);
  return {
    product, company, project, totalCount: count, batches: result, batchString: batchStr
  };
  
}

  /**
 * 替代原来两套复用判断逻辑，校验批次是否可共用
 */
_checkBatchCanJoin(batchNo, newProduct, company, project, productType, targetLen, batchAllLen) {
  const batchYY = parseInt(batchNo.slice(0,2));
  const batchMM = parseInt(batchNo.slice(2,4));
  const batchTotal = batchYY * 12 + batchMM;
  const currTotal = this.currentYear * 12 + this.currentMonth;
  // 过期拦截
  if (currTotal - batchTotal >=6) return false;
  // 实验状态统一校验（取批次第一条规格对比）
  const firstSpec = batchAllLen[0];
  const firstFull = `M${getSpecX(newProduct)}*${firstSpec}`;
  if (!isExperimentStatusMatch(productType, newProduct, firstFull)) return false;
  // 长度区间校验
  const minL = Math.min(...batchAllLen);
  const maxL = Math.max(...batchAllLen);
  if (!isLengthMatch(targetLen, minL) || !isLengthMatch(targetLen, maxL)) return false;
  return true;
}

  //新建批次
  async _createNewBatch(remainingNeed, product, company, project, productType, specX, specLen, result) {
  const yearMonth = `${this.yearStr}${this.monthStr}`;
  while (remainingNeed > 0) {
    let newBatchNo = null;
    // 无限重试直到拿到不重复批次
    while (true) {
      try {
        const useCount = Math.min(remainingNeed, this.BATCH_CAPACITY);
        const remainStock = this.BATCH_CAPACITY - useCount;
        const createTime = formatMysqlTime();
        const tempBatchNo = await createStockBatch(yearMonth, this.BATCH_CAPACITY, remainStock,company, project, productType, product, specX, specLen, createTime);
        // const seqStr = String(currentSeq).padStart(4, '0');
        // const tempBatchNo = `${yearMonth}${seqStr}`;
        
        // 尝试新建，重复会抛DUPLICATE_BATCH_NO
        // await createStockBatch(
        //   tempBatchNo, currentSeq, this.BATCH_CAPACITY, remainStock,
        //   company, project, productType, product, specX, specLen, createTime
        // );
        newBatchNo = tempBatchNo;
        break;
      } catch (err) {
        // 批次重复，继续循环取下一个seq
        if (err.message === 'DUPLICATE_BATCH_NO') {
          continue;
        }
        // 其他错误直接抛出
        throw err;
      }
    }

    const useCount = Math.min(remainingNeed, this.BATCH_CAPACITY);
    const remainStock = this.BATCH_CAPACITY - useCount;
    result.push({
      batchNo: newBatchNo,
      useCount,
      remainingInBatch: remainStock,
      from: '新建批次'
    });
    remainingNeed -= useCount;
  }
}
}

module.exports = BatchManager;