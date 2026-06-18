// 批次管理核心类
const { loadInuse, saveInuse } = require('../storage/inuse');
const { saveHistory } = require('../storage/history');
const { savePiciRecord } = require('../storage/picihao');
const { BATCH_CONFIG, saveBatchConfig } = require('../config/batchConfig');
const { isBatchExpired, isLengthMatch, canJoinBatch, updateBatchSpecs } = require('../utils/batchUtils');
const { getSpecX, getSpecLength } = require('../utils/specUtils');
const { formatBatchString } = require('../utils/formatUtils');

class BatchManager {
  constructor() {
    const { YEAR, MONTH, BATCH_CAPACITY, SEQ_START } = BATCH_CONFIG;
    
    // 基础属性
    this.currentYear = parseInt(YEAR);
    this.currentMonth = parseInt(MONTH);
    this.yearStr = YEAR;
    this.monthStr = String(MONTH).padStart(2, '0');
    this.BATCH_CAPACITY = BATCH_CAPACITY;
    this.globalMaxSeq = SEQ_START;

    // 加载数据
    this.inuse = loadInuse();
  }

  // 分配批次核心方法
  assignBatch(product, company, project, count,productType) {
  let remainingNeed = count;
  const result = [];
  const newInuseList = [];
  const inuseItems = this.inuse.list || [];
  let restItems = [...inuseItems];

   const targetLen = getSpecLength(product);
  restItems.sort((a, b) => {
    const aLenAvg = a.specLengths.reduce((s, v) => s + v, 0) / a.specLengths.length;
    const bLenAvg = b.specLengths.reduce((s, v) => s + v, 0) / b.specLengths.length;
    const diffA = Math.abs(aLenAvg - targetLen);
    const diffB = Math.abs(bLenAvg - targetLen);
    return diffA - diffB;
  });

  // 1. 实验+长度匹配复用
  restItems = this._reuseBatchByExperimentAndLength(restItems, product, company, project, productType, remainingNeed, result, newInuseList);
  remainingNeed = count - result.reduce((sum, item) => sum + item.useCount, 0);

  // 2. 仅长度匹配复用
  if (remainingNeed > 0) {
    restItems = this._reuseBatchByLengthOnly(restItems, product, company, project, productType, remainingNeed, result, newInuseList);
    remainingNeed = count - result.reduce((sum, item) => sum + item.useCount, 0);
  }

  // 【修复点1】统一把两轮过滤后剩余所有未复用批次全部加入newInuseList，不再分支判断
  newInuseList.push(...restItems);

  // 3. 剩余需求新建批次
  if (remainingNeed > 0) {
    this._createNewBatch(remainingNeed, product, company, project, productType, result, newInuseList);
  }

  // 覆盖写入
  this.inuse.list = newInuseList;
  saveBatchConfig({ SEQ_START: this.globalMaxSeq });
  saveInuse(this.inuse);
  const batchStr = formatBatchString(result, this.yearStr, this.monthStr, this.BATCH_CAPACITY);
  savePiciRecord(product, company, project, count, batchStr);
  return {
    product, company, project,
    totalCount: count,
    batches: result,
    batchString: batchStr
  };
}

  //复用（实验+长度匹配）
  _reuseBatchByExperimentAndLength(restItems, product, company, project, productType, remainingNeed, result,newInuseList) {
    const tempList = [];
    for (const item of restItems) {
      if (remainingNeed <= 0) {
        tempList.push(item);
        continue;
      }
      if (canJoinBatch(item, product, company, project, productType, this.currentYear, this.currentMonth)) {
        const use = Math.min(remainingNeed, item.remaining);
        result.push({
          batchNo: item.batchNo,
          useCount: use,
          remainingInBatch: item.remaining - use,
          from: '复用(实验+长度匹配)'
        });
        saveHistory({
          ...item, useCount: use,
          remaining: item.remaining - use,
          status: item.remaining - use > 0 ? 'inuse' : 'used',
          action: '复用(实验+长度匹配)'
        });
        updateBatchSpecs(item, product);
        if (item.remaining - use > 0) {
          newInuseList.push({ ...item, remaining: item.remaining - use });
        }
        remainingNeed -= use;
      } else {
        tempList.push(item);
      }
    }
    return tempList;
  }

  //复用（仅长度匹配）
_reuseBatchByLengthOnly(restItems, product, company, project, productType, remainingNeed, result, newInuseList) {
  const tempList = [];
  const targetX = getSpecX(product);
  const targetLen = getSpecLength(product);
  for (const item of restItems) {
    if (remainingNeed <= 0) {
      tempList.push(item);
      continue;
    }
    // 1. 校验全部规格直径统一
    const specNames = item.specNames || [];
    const allSameDiameter = specNames.every(name => getSpecX(name) === targetX);
    if (!allSameDiameter) {
      tempList.push(item);
      continue;
    }
    // 2. 补充同公司、同项目、同类型校验（之前缺失）
    if (item.company !== company || item.project !== project || item.productType !== productType) {
      tempList.push(item);
      continue;
    }
    const batchLengths = item.specLengths || [];
    if (batchLengths.length === 0) {
      tempList.push(item);
      continue;
    }
    // 新增：和第一层canJoinBatch保持一致，必须同时满足最小、最大长度公差
    const minLen = Math.min(...batchLengths);
    const maxLen = Math.max(...batchLengths);
    const fullRangeMatch = isLengthMatch(targetLen, minLen) && isLengthMatch(targetLen, maxLen);
    const lenOk = fullRangeMatch && item.remaining > 0;

    if (lenOk) {
      const use = Math.min(remainingNeed, item.remaining);
      result.push({
        batchNo: item.batchNo,
        useCount: use,
        remainingInBatch: item.remaining - use,
        from: '复用(仅长度匹配)'
      });
      saveHistory({
        ...item, useCount: use,
        remaining: item.remaining - use,
        status: item.remaining - use > 0 ? 'inuse' : 'used',
        action: '复用(仅长度匹配)'
      });
      updateBatchSpecs(item, product);
      if (item.remaining - use > 0) {
        newInuseList.push({ ...item, remaining: item.remaining - use });
      }
      remainingNeed -= use;
    } else {
      tempList.push(item);
    }
  }
  return tempList;
}

  //新建批次
  _createNewBatch(remainingNeed, product, company, project, productType, result, newInuseList) {
    while (remainingNeed > 0) {
      this.globalMaxSeq += 1;
      const seq = String(this.globalMaxSeq).padStart(4, '0');
      const batchNo = `${this.yearStr}${this.monthStr}${seq}`;
      const useCount = Math.min(remainingNeed, this.BATCH_CAPACITY);
      const remaining = this.BATCH_CAPACITY - useCount;
      const newBatch = {
        product, company, project, batchNo,
        seq: this.globalMaxSeq,
        totalCapacity: this.BATCH_CAPACITY,
        useCount, remaining,
        specNames: [product],
        productType: productType,
        specLengths: [getSpecLength(product)],
        status: remaining > 0 ? 'inuse' : 'used',
        createTime: new Date().toLocaleString()
      };
      saveHistory(newBatch);
      if (remaining > 0) {
        newInuseList.push(newBatch);
      }
      result.push({
        batchNo: newBatch.batchNo,
        useCount,
        remainingInBatch: remaining,
        from: '新建批次'
      });
      remainingNeed -= useCount;
    }
  }
}

module.exports = BatchManager;