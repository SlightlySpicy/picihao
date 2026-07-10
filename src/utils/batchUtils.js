// 批次规则（过期判断、长度匹配、批次加入规则）
const { getSpecX, getSpecLength, isExperimentStatusMatch } = require('./specUtils');
const { BATCH_CONFIG } = require('../config/batchConfig.js');

// 判断批次号是否超过半年（过期）
function isBatchExpired(batchNo, currentYear, currentMonth) {
  if (!batchNo || batchNo.length < 4) return true;
  
  const batchYY = parseInt(batchNo.slice(0, 2));
  const batchMM = parseInt(batchNo.slice(2, 4));
  const batchTotal = batchYY * 12 + batchMM;
  const currentTotal = currentYear * 12 + currentMonth;
  
  return currentTotal - batchTotal >= 6;
}

// 判断两个长度是否满足共用批次的规则
function isLengthMatch(x, c) {
  const diff = Math.abs(x - c);
  const { ALLOW_LENGTH_DIFF_100 = 15, ALLOW_LENGTH_DIFF_OVER100 = 20 } = BATCH_CONFIG;
  
  if (x <= 100 || c <= 100) {
    return diff <= ALLOW_LENGTH_DIFF_100;
  }
  return diff <= ALLOW_LENGTH_DIFF_OVER100;
}

// 判断新规格是否能进入已有批次
function canJoinBatch(batchItem, newProduct, company, project, productType, currentYear, currentMonth) {
  // 1. 批次过期/产品类型不一致 → 拒绝
  if (isBatchExpired(batchItem.batchNo, currentYear, currentMonth) 
      || batchItem.productType !== productType) {
    return false;
  }
  
  // 2. 公司、项目不一致 → 拒绝
  if (batchItem.company !== company || batchItem.project !== project) {
    return false;
  }

  // 3. 直径X不一致 → 拒绝
  const newX = getSpecX(newProduct);
  const firstSpecName = batchItem.specNames?.[0];
  if (!firstSpecName) return true; // 空批次放行
  const batchX = getSpecX(firstSpecName);
  if (newX !== batchX) return false;

  // 4. 实验状态匹配校验
  const existingLengths = batchItem.specLengths || [];
  let isExperimentMatch = true;
  if (existingLengths.length > 0 && firstSpecName) {
    isExperimentMatch = isExperimentStatusMatch(productType, newProduct, firstSpecName);
  }

  // 5. 长度匹配校验
  const newLen = getSpecLength(newProduct);
  let isLengthMatchResult = true;
  if (existingLengths.length > 0) {
    const minLen = Math.min(...existingLengths);
    const maxLen = Math.max(...existingLengths);
    isLengthMatchResult = isLengthMatch(newLen, minLen) && isLengthMatch(newLen, maxLen);
  }

  return isExperimentMatch && isLengthMatchResult;
}



module.exports = {
  isBatchExpired,
  isLengthMatch,
  canJoinBatch,
};