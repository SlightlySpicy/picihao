// 固定年月常量，动态取当前年月可自行修改，此处硬编码适配业务
const BATCH_CONFIG = {
  YEAR: new Date().getFullYear().toString().slice(-2),
  MONTH: String(new Date().getMonth() + 1).padStart(2, '0'),
  BATCH_CAPACITY: 3000,
  ALLOW_LENGTH_DIFF_100: 15,
  ALLOW_LENGTH_DIFF_OVER100: 20
};
// 删除saveBatchConfig函数，彻底废弃本地序列号文件
module.exports = { BATCH_CONFIG };