// 批次字符串格式化工具
function formatBatchString(batches, yearStr, monthStr, batchCapacity) {
  const segmentList = [];
  let fullStart = null, fullEnd = null;

  for (const item of batches) {
    const seq = parseInt(item.batchNo.slice(-4));
    const isFull = item.useCount === batchCapacity;

    if (isFull) {
      fullStart = fullStart ?? seq;
      fullEnd = seq;
    } else {
      if (fullStart !== null) {
        const s = `${yearStr}${monthStr}${String(fullStart).padStart(4, '0')}`;
        const e = `${yearStr}${monthStr}${String(fullEnd).padStart(4, '0')}`;
        segmentList.push(fullStart === fullEnd ? s : `${s}-${e}`);
        fullStart = fullEnd = null;
      }
      segmentList.push(`${item.batchNo}(${item.useCount})`);
    }
  }

  if (fullStart !== null) {
    const s = `${yearStr}${monthStr}${String(fullStart).padStart(4, '0')}`;
    const e = `${yearStr}${monthStr}${String(fullEnd).padStart(4, '0')}`;
    segmentList.push(fullStart === fullEnd ? s : `${s}-${e}`);
  }

  return segmentList.join('/');
}

module.exports = { formatBatchString };