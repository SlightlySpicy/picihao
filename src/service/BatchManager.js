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
  const newInuseList = []; // 最终要存进inuse.json的全部在用批次
  const inuseItems = this.inuse.list || [];
  let restItems = [...inuseItems];

  // 1. 第一轮：严格匹配（实验+长度）
  restItems = this._reuseBatchByExperimentAndLength(restItems, product, company, project, productType, remainingNeed, result, newInuseList);
  remainingNeed = count - result.reduce((sum, item) => sum + item.useCount, 0);

  // 2. 第二轮：宽松仅长度匹配
  if (remainingNeed > 0) {
    restItems = this._reuseBatchByLengthOnly(restItems, product, company, project, productType, remainingNeed, result, newInuseList);
    remainingNeed = count - result.reduce((sum, item) => sum + item.useCount, 0);
  } else {
    // 无剩余需求，剩下所有旧批次全部原样存入newInuseList
    newInuseList.push(...restItems);
  }

  // 第二轮走完后，剩下的restItems全部原样回收
  if (remainingNeed > 0) {
    newInuseList.push(...restItems);
  }
    newInuseList.push(...restItems);
  // 3. 剩余数量新建批次，新建的自动push进newInuseList
  if (remainingNeed > 0) {
    this._createNewBatch(remainingNeed, product, company, project, productType, result, newInuseList);
  }

  // 覆盖写入完整列表
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
  _reuseBatchByLengthOnly(restItems, product, company, project, productType, remainingNeed, result) {
    const tempList = [];
    for (const item of restItems) {
      if (remainingNeed <= 0) {
        tempList.push(item);
        continue;
      }
      const expired = isBatchExpired(item.batchNo, this.currentYear, this.currentMonth);
      const sameType = item.productType === productType;
      const sameCompanyProj = item.company === company && item.project === project;
      const newX = getSpecX(product);
      const batchFirstSpec = item.specNames?.[0];
      const sameX = batchFirstSpec ? (getSpecX(batchFirstSpec) === newX) : true;

      if (expired || !sameType || !sameCompanyProj || !sameX) {
        tempList.push(item);
        continue;
      }

      const newLen = getSpecLength(product);
      const existingLengths = item.specLengths || [];
      let lenOk = true;
      if (existingLengths.length > 0) {
        const minLen = Math.min(...existingLengths);
        const maxLen = Math.max(...existingLengths);
        lenOk = isLengthMatch(newLen, minLen) && isLengthMatch(newLen, maxLen);
      }

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
          tempList.push({ ...item, remaining: item.remaining - use });
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