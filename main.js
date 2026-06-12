const { loadHistory, saveHistory, loadInuse, saveInuse } = require('./storage');
const { BATCH_CONFIG ,saveBatchConfig} = require('./config');
const fs = require('fs');
const path = require('path');
const { loadExperimentRules } = require('./experimentRules'); 

// 批次号记录文件
const picihaoPath = path.join(__dirname, 'picihao.json');

class BatchManager {
  constructor() {
    const { YEAR, MONTH, BATCH_CAPACITY, SEQ_START, ALLOW_LENGTH_DIFF_100, ALLOW_LENGTH_DIFF_OVER100 } = BATCH_CONFIG;
    
    // 当前年月（用于判断是否超过半年）
    this.currentYear = parseInt(YEAR);
    this.currentMonth = parseInt(MONTH);
    
    // 格式化年月字符串
    this.yearStr = String(YEAR).slice(-2);
    this.monthStr = String(MONTH).padStart(2, '0');
    
    // 批次容量
    this.BATCH_CAPACITY = BATCH_CAPACITY;
    
    // 长度差值配置
    this.ALLOW_DIFF_100 = ALLOW_LENGTH_DIFF_100 ?? 15;    // ≤100 允许差15
    this.ALLOW_DIFF_OVER = ALLOW_LENGTH_DIFF_OVER100 ?? 20; // >100 允许差20

    // 加载数据
    this.inuse = loadInuse();
    this.globalMaxSeq =  SEQ_START;

    // 加载实验规则
    this.experimentRules = loadExperimentRules();
  }

  // 工具：从产品名提取长度 y（M*y）
  getSpecLength(product) {
    const match = product.match(/\*(\d+)/);
    return match ? parseInt(match[1]) : 9999;
  }

  // 工具：从产品名提取M后的x（如M16*45 → 16）
  getSpecX(product) {
    const match = product.match(/M(\d+)\*/);
    return match ? parseInt(match[1]) : 0;
  }

  // 解析产品类型（大六角/扭剪）+ 规格 → 实验执行状态
  getExperimentStatus(productType, product) {
    const x = this.getSpecX(product);
    const y = this.getSpecLength(product);
    if (!x || !y) return {};

    // 获取当前产品类型的规则
    const typeRules = this.experimentRules[productType] || {};
    const specRules = typeRules[x] || {};
    
    // 返回实验状态：是否需要做轴力/锲负载实验
    return {
      needAxialForce: y >= (specRules["轴力实验阈值"] || 0),
      needWedgeload: y >= (specRules["锲负载实验阈值"] || 0)
    };
  }

  // 判断两个规格的实验状态是否完全一致
  isExperimentStatusMatch(productType, productA, productB) {
    const statusA = this.getExperimentStatus(productType, productA);
    const statusB = this.getExperimentStatus(productType, productB);
    return statusA.needAxialForce === statusB.needAxialForce 
        && statusA.needWedgeload === statusB.needWedgeload;
  }

  // 工具：判断批次号是否超过半年（过期）
  isBatchExpired(batchNo) {
    // 批次号格式：YYMMxxxx → 前4位是年月
    if (!batchNo || batchNo.length < 4) return true;
    
    const batchYY = parseInt(batchNo.slice(0, 2));
    const batchMM = parseInt(batchNo.slice(2, 4));
    
    // 转成年月总数
    const batchTotal = batchYY * 12 + batchMM;
    const currentTotal = this.currentYear * 12 + this.currentMonth;
    
    // 超过 6 个月 = 过期
    return currentTotal - batchTotal > 6;
  }

  // 工具：判断两个长度是否满足共用批次的规则
  isMatch(x, c) {
    const diff = Math.abs(x - c);
    // 任意一个 ≤100 → 差值 ≤15
    if (x <= 100 || c <= 100) {
      return diff <= 15;
    }
    // 都 >100 → 差值 ≤20
    return diff <= 20;
  }

  // 判断新规格是否能进入已有批次 
  canJoinBatch(batchItem, newProduct, company, project, productType) {
    // 1. 批次过期 → 不能用
    if (this.isBatchExpired(batchItem.batchNo)) {
      return false;
    }
    // 产品类型必须相同 大六角还是扭剪
    if (batchItem.productType !== productType) {
    return false;
    }
    // 2. 公司、项目必须一致
    if (batchItem.company !== company  || batchItem.project !== project) {
      return false;
    }

    // 直径X必须一致校验
    const newX = this.getSpecX(newProduct);
    const firstSpecName = batchItem.specNames?.[0];
    // 空批次直接放行
    if (!firstSpecName) return true;
    const batchX = this.getSpecX(firstSpecName);
    // 直径不一样，直接禁止加入
    if (newX !== batchX) return false;

     // 2. 获取批次内已有规格的实验状态（取第一个非空规格）
    const existingLengths = batchItem.specLengths || [];
    let isExperimentMatch = true;
    if (existingLengths.length > 0) {
      // 批次内第一个规格的完整产品名（需补充：batchItem需存储原始规格名，见3.4）
      const firstSpecName = batchItem.specNames?.[0] || ''; 
      if (firstSpecName) {
        isExperimentMatch = this.isExperimentStatusMatch(productType, newProduct, firstSpecName);
      }
    }

    // 3. 获取新规格长度
    const newLen = this.getSpecLength(newProduct);
    // 4. 取出这个批次里【所有已用规格】的长度
    //  existingLengths = batchItem.specLengths || [];
    if (existingLengths.length === 0) {
      // 空批次 → 直接可以进
      return true;
    }

    let isLengthMatch = true;
    if (existingLengths.length > 0) {
      const minLen = Math.min(...existingLengths);
      const maxLen = Math.max(...existingLengths);
      isLengthMatch = this.isMatch(newLen, minLen) && this.isMatch(newLen, maxLen);
    }
    // 4. 优先返回「实验状态+长度都匹配」，无则返回长度匹配
    return isExperimentMatch && isLengthMatch;
  }

  //工具：给批次追加规格长度
  updateBatchSpecs(batchItem, newProduct) {
    const len = this.getSpecLength(newProduct);
    // 记录规格名（去重）
    if (!batchItem.specNames) batchItem.specNames = [];
    if (!batchItem.specNames.includes(newProduct)) {
      batchItem.specNames.push(newProduct);
    }
    if (!batchItem.specLengths) batchItem.specLengths = [];
    if (!batchItem.specLengths.includes(len)) {
      batchItem.specLengths.push(len);
    }
  }

  // 批次字符串格式化
  formatBatchString(batches) {
    const segmentList = [];
    let fullStart = null, fullEnd = null;

    for (const item of batches) {
      const seq = parseInt(item.batchNo.slice(-4));
      const isFull = item.useCount === this.BATCH_CAPACITY;

      if (isFull) {
        fullStart = fullStart ?? seq;
        fullEnd = seq;
      } else {
        if (fullStart !== null) {
          const s = `${this.yearStr}${this.monthStr}${String(fullStart).padStart(4, '0')}`;
          const e = `${this.yearStr}${this.monthStr}${String(fullEnd).padStart(4, '0')}`;
          segmentList.push(fullStart === fullEnd ? s : `${s}-${e}`);
          fullStart = fullEnd = null;
        }
        segmentList.push(`${item.batchNo}(${item.useCount})`);
      }
    }

    if (fullStart !== null) {
      const s = `${this.yearStr}${this.monthStr}${String(fullStart).padStart(4, '0')}`;
      const e = `${this.yearStr}${this.monthStr}${String(fullEnd).padStart(4, '0')}`;
      segmentList.push(fullStart === fullEnd ? s : `${s}-${e}`);
    }

    return segmentList.join('/');
  }

  //保存批次记录
  savePiciRecord(product, company, project, totalNum, batchStr) {
    let arr = [];
    if (fs.existsSync(picihaoPath)) {
      arr = JSON.parse(fs.readFileSync(picihaoPath, 'utf8'));
    }
    arr.push({
      company,
      project,
      product,
      batchString: batchStr,
      totalCount: totalNum,
      createTime: new Date().toLocaleString()
    });
    fs.writeFileSync(picihaoPath, JSON.stringify(arr, null, 2), 'utf8');
  }

  assignBatch(product, company, project, count,productType) {
  let remainingNeed = count;
  const result = [];
  const newInuseList = [];
  const inuseItems = this.inuse.list || [];
  let restItems = [...inuseItems];

  // 实验+长度 都匹配 优先复用
  let tempList = [];
  for (const item of restItems) {
    if (remainingNeed <= 0) {
      tempList.push(item);
      continue;
    }
    if (this.canJoinBatch(item, product, company, project, productType)) {
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
      this.updateBatchSpecs(item, product);
      if (item.remaining - use > 0) {
        newInuseList.push({ ...item, remaining: item.remaining - use });
      }
      remainingNeed -= use;
    } else {
      tempList.push(item);
    }
  }
  restItems = tempList;

  // 只匹配长度（忽略实验规则）
  if (remainingNeed > 0) {
    for (const item of restItems) {
      if (remainingNeed <= 0) {
        newInuseList.push(item);
        continue;
      }
      const expired = this.isBatchExpired(item.batchNo);
      const sameType = item.productType === productType;
      const sameCompanyProj = item.company === company && item.project === project;
      // 新增直径校验
      const newX = this.getSpecX(product);
      const batchFirstSpec = item.specNames?.[0];
      const sameX = batchFirstSpec ? (this.getSpecX(batchFirstSpec) === newX) : true;
      if (expired ||!sameType || !sameCompanyProj || !sameX) {
        newInuseList.push(item);
        continue;
      }

      const newLen = this.getSpecLength(product);
      const existingLengths = item.specLengths || [];
      let lenOk = true;
      if (existingLengths.length > 0) {
        const minLen = Math.min(...existingLengths);
        const maxLen = Math.max(...existingLengths);
        lenOk = this.isMatch(newLen, minLen) && this.isMatch(newLen, maxLen);
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
        this.updateBatchSpecs(item, product);
        if (item.remaining - use > 0) {
          newInuseList.push({ ...item, remaining: item.remaining - use });
        }
        remainingNeed -= use;
      } else {
        newInuseList.push(item);
      }
    }
  } else {
    newInuseList.push(...restItems);
  }

  //剩余数量 新建批次
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
      specLengths: [this.getSpecLength(product)],
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

  // 保存
  this.inuse.list = newInuseList;
  saveBatchConfig({ SEQ_START: this.globalMaxSeq });
  saveInuse(this.inuse);
  const batchStr = this.formatBatchString(result);
  this.savePiciRecord(product, company, project, count, batchStr);

  return {
    product, company, project,
    totalCount: count,
    batches: result,
    batchString: batchStr
  };
}

}

//命令行调用，测试
async function runMain() {
  const args = process.argv.slice(2);
  if (args.length < 5) {
     console.log('用法: node main.js "产品" "公司" "项目" 数量 "产品类型(大六角/扭剪)"');
    console.log('示例: node main.js "M16*45" "A公司" "B项目" 1500 "扭剪"');
    process.exit(1);
  }

  const [product, company, project, countStr, productType] = args;
  const count = parseInt(countStr);

  if (isNaN(count) || count <= 0) {
    console.log('数量必须是正整数');
    process.exit(1);
  }

  const bm = new BatchManager();
  const res = bm.assignBatch(product, company, project, count, productType);

  console.log('\n================================');
  console.log('产品：', product);
  console.log('公司：', company);
  console.log('项目：', project);
  console.log('申请数量：', count);
  console.log('产品类型：', productType);
  console.log('--------------------------------');
  res.batches.forEach((item, i) => {
    console.log(`${i+1}. ${item.batchNo} | 使用：${item.useCount} | 剩余：${item.remainingInBatch} | ${item.from}`);
  });
  console.log('--------------------------------');
  console.log('最终批次号：', res.batchString);
  console.log('================================\n');
}

runMain();