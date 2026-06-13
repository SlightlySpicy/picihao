// 提取产品规格相关工具，提取长度和规格、解析实验状态、判断实验状态是否匹配等
const { loadExperimentRules } = require('../config/experimentRules');

// 从产品名提取长度 y（M*y）
function getSpecLength(product) {
  const match = product.match(/\*(\d+)/);
  return match ? parseInt(match[1]) : 9999;
}

// 从产品名提取M后的x（如M16*45 → 16）
function getSpecX(product) {
  const match = product.match(/M(\d+)\*/);
  return match ? parseInt(match[1]) : 0;
}
//产品格式校验（M开头，*分隔，数字）
function validateProductFormat(product) {
  const reg = /^M\d+\*\d+$/;
  return reg.test(product);
}

// 解析产品实验执行状态
function getExperimentStatus(productType, product) {
  const experimentRules = loadExperimentRules();
  const x = getSpecX(product);
  const y = getSpecLength(product);
  if (!x || !y) return { needAxialForce: false, needWedgeload: false };

  const typeRules = experimentRules[productType] || {};
  const specRules = typeRules[x] || {};
  
  return {
    needAxialForce: y >= (specRules["轴力实验阈值"] || 0),
    needWedgeload: y >= (specRules["锲负载实验阈值"] || 0)
  };
}

// 判断两个规格的实验状态是否一致
function isExperimentStatusMatch(productType, productA, productB) {
  const statusA = getExperimentStatus(productType, productA);
  const statusB = getExperimentStatus(productType, productB);
  return statusA.needAxialForce === statusB.needAxialForce 
      && statusA.needWedgeload === statusB.needWedgeload;
}

module.exports = {
  getSpecLength,
  getSpecX,
  getExperimentStatus,
  isExperimentStatusMatch,
  validateProductFormat
};