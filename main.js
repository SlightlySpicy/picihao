const { loadHistory, saveHistory, loadInuse, saveInuse } = require('./storage');
const { BATCH_CONFIG ,saveBatchConfig} = require('./config');
const fs = require('fs');
const path = require('path');

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
  }

  // 工具：从产品名提取长度 y（M*y）
  getSpecLength(product) {
    const match = product.match(/\*(\d+)/);
    return match ? parseInt(match[1]) : 9999;
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
  canJoinBatch(batchItem, newProduct, company, project) {
    // 1. 批次过期 → 不能用
    if (this.isBatchExpired(batchItem.batchNo)) {
      return false;
    }

    // 2. 公司、项目必须一致
    if (batchItem.company !== company  || batchItem.project !== project) {
      return false;
    }

    // 3. 获取新规格长度
    const newLen = this.getSpecLength(newProduct);

    // 4. 取出这个批次里【所有已用规格】的长度
    const existingLengths = batchItem.specLengths || [];
    if (existingLengths.length === 0) {
      // 空批次 → 直接可以进
      return true;
    }

    const minLen = Math.min(...existingLengths);
    const maxLen = Math.max(...existingLengths);

    // 5. 判断新规格长度与批次内所有已用规格长度的关系
    const ok1 = this.isMatch(newLen, minLen);
    const ok2 = this.isMatch(newLen, maxLen);
    return ok1 && ok2;
  }

  //工具：给批次追加规格长度
  updateBatchSpecLengths(batchItem, newProduct) {
    const len = this.getSpecLength(newProduct);
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

  assignBatch(product, company, project, count) {
    let remainingNeed = count;
    const result = [];
    const newInuseList = [];
    const inuseItems = this.inuse.list || [];

    // ==============================================
  // 第一步：优先复用 inuse 里【符合规则】的批次
  // ==============================================
    for (const item of inuseItems) {
      if (remainingNeed <= 0) {
        newInuseList.push(item);
        continue;
      }

      // 判断：是否能加入这个批次
      if (this.canJoinBatch(item, product, company, project)) {
        const use = Math.min(remainingNeed, item.remaining);

        // 记录使用
        result.push({
          batchNo: item.batchNo,
          useCount: use,
          remainingInBatch: item.remaining - use,
          from: '复用合规批次'
        });

        // 写入历史
        saveHistory({
          ...item, useCount: use,
          remaining: item.remaining - use,
          status: item.remaining - use > 0 ? 'inuse' : 'used',
          action: '复用合规批次'
        });

        // 更新批次内规格长度
        this.updateBatchSpecLengths(item, product);

        // 没用完 → 继续留在 inuse
        if (item.remaining - use > 0) {
          newInuseList.push({ ...item, remaining: item.remaining - use });
        }

        remainingNeed -= use;
      } else {
        // 不满足 → 保留在 inuse
        newInuseList.push(item);
      }
    }

  // 第二步：还有剩余需求 → 新建批次（从当前最大序号后开始）
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
        specLengths: [this.getSpecLength(product)], // 初始化规格长度
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

  // 保存 & 返回
    this.inuse.list = newInuseList;
    // 把最新序号 写回 config.js =====================
    saveBatchConfig({ SEQ_START: this.globalMaxSeq });

    // saveHistory(this.history);
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

//命令行调用
async function runMain() {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.log('用法: node index.js "产品" "公司" "项目" 数量');
    console.log('示例: node index.js "M16*115" "大运公司" "800v项目" 1500');
    process.exit(1);
  }

  const [product, company, project, countStr] = args;
  const count = parseInt(countStr);

  if (isNaN(count) || count <= 0) {
    console.log('数量必须是正整数');
    process.exit(1);
  }

  const bm = new BatchManager();
  const res = bm.assignBatch(product, company, project, count);

  console.log('\n================================');
  console.log('产品：', product);
  console.log('公司：', company);
  console.log('项目：', project);
  console.log('申请数量：', count);
  console.log('--------------------------------');
  res.batches.forEach((item, i) => {
    console.log(`${i+1}. ${item.batchNo} | 使用：${item.useCount} | 剩余：${item.remainingInBatch} | ${item.from}`);
  });
  console.log('--------------------------------');
  console.log('最终批次串：', res.batchString);
  console.log('================================\n');
}

runMain();