const Joi = require('joi');
const xss = require('xss');

// 递归过滤对象所有字段XSS
function filterXSS(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return typeof obj === 'string' ? xss(obj) : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => filterXSS(item));
  }
  const newObj = {};
  for (const key in obj) {
    newObj[key] = filterXSS(obj[key]);
  }
  return newObj;
}

// 创建批次接口参数校验规则
const createBatchSchema = Joi.object({
  product: Joi.string().pattern(/^M\d+\*\d+$/).required().messages({
    'string.pattern.base': '产品规格格式错误，示例M16*45'
  }),
  company: Joi.string().min(1).max(100).required(),
  project: Joi.string().min(1).max(100).required(),
  count: Joi.number().integer().greater(0).required(),
  productType: Joi.string().valid('扭剪','大六角').required()
});

// 统一校验函数
function validateParams(schema, reqBody) {
  // 先XSS清洗
  const cleanBody = filterXSS(reqBody);
  const { error, value } = schema.validate(cleanBody, { abortEarly: false });
  if (error) {
    const errMsg = error.details.map(d => d.message).join(';');
    return { pass: false, msg: errMsg, data: null };
  }
  return { pass: true, msg: "", data: value };
}

module.exports = {
  filterXSS,
  createBatchSchema,
  validateParams
};