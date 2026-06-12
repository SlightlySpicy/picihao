const fs = require('fs');
const path = require('path');
const rulePath = path.join(__dirname, 'experimentRules.json');

// 默认规则
const DEFAULT_EXPERIMENT_RULES = {
  // 扭剪型规则
  "扭剪": {
    "16": { "轴力实验阈值": 50, "锲负载实验阈值": 50 }, // y<50 都不做
    "20": { "轴力实验阈值": 55, "锲负载实验阈值": 65 }, // y<55 不做轴力；y<65 不做锲负载
    "22": { "轴力实验阈值": 60, "锲负载实验阈值": 70 },
    "24": { "轴力实验阈值": 65, "锲负载实验阈值": 75 },
    "27": { "轴力实验阈值": 70, "锲负载实验阈值": 85 },
    "30": { "轴力实验阈值": 75, "锲负载实验阈值": 95 },
  },
  // 大六角型规则
  "大六角": {
    "12": { "锲负载实验阈值": 40 }, 
    "16": { "锲负载实验阈值": 50 }, // y<50 都不做
    "20": { "锲负载实验阈值": 65 }, // y<55 不做轴力；y<65 不做锲负载
    "22": { "锲负载实验阈值": 70 },
    "24": { "锲负载实验阈值": 75 },
    "27": { "锲负载实验阈值": 85 },
    "30": { "锲负载实验阈值": 95 },
    "33": { "锲负载实验阈值": 100 },
    "36": { "锲负载实验阈值": 110 }
  }
};

// 初始化规则文件（不存在则创建）
function initRuleFile() {
  if (!fs.existsSync(rulePath)) {
    fs.writeFileSync(rulePath, JSON.stringify(DEFAULT_EXPERIMENT_RULES, null, 2), 'utf8');
  }
}

// 加载实验规则
function loadExperimentRules() {
  initRuleFile();
  return JSON.parse(fs.readFileSync(rulePath, 'utf8'));
}

module.exports = {
  loadExperimentRules
};