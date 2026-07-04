// config/auth.js
const crypto = require('crypto');

// 合法密钥列表，生产建议从环境变量读取 process.env.AUTH_AK_LIST
const AUTH_SECRETS = [
  {
    ak: "bolt_api_ak_20260702",
    sk: "bolt_api_sk_@#2026BoltBatch"
  }
];

// 签名算法：客户端规则
/**
 * 客户端请求鉴权规则：
 * Header 携带3个参数：
 * X-Ak: 分配的AK
 * X-Timestamp: 当前时间戳(ms)，允许偏差±300s（5分钟防重放）
 * X-Signature: 签名
 * 签名生成规则：
 * signStr = AK + SK + timestamp + 请求body原始JSON字符串
 * signature = crypto.createHmac('sha256', sk).update(signStr).digest('hex')
 */

// 校验签名
function verifySign(ak, sk, timestamp, rawBody, signature) {
  // 时间戳校验，防重放攻击
  const now = Date.now();
  const ts = Number(timestamp);
  if (isNaN(ts) || Math.abs(now - ts) > 300 * 1000) {
    return false;
  }
  const signStr = `${ak}${sk}${timestamp}${rawBody}`;
  const calcSign = crypto.createHmac('sha256', sk).update(signStr).digest('hex');
  return calcSign === signature;
}

// 鉴权中间件
function authMiddleware(req, res, next) {
  // 只拦截/api开头接口，/ping健康接口放行
  if (!req.path.startsWith('/api/')) {
    return next();
  }
  const ak = req.headers['x-ak'];
  const timestamp = req.headers['x-timestamp'];
  const signature = req.headers['x-signature'];

  // 头部缺失直接拒绝
  if (!ak || !timestamp || !signature) {
    return res.json({ code: 401, msg: "缺少鉴权头部 X-Ak/X-Timestamp/X-Signature" });
  }

  // 匹配AK获取SK
  const authItem = AUTH_SECRETS.find(item => item.ak === ak);
  if (!authItem) {
    return res.json({ code: 401, msg: "无效AK密钥" });
  }

  // req.rawBody 后面express配置获取原始body，用于签名
  let rawBody = req.rawBody || JSON.stringify(req.body || {});
  rawBody = rawBody.replace(/\s+/g, ''); //移除一些错误的空格，确保签名一致性
    // 打印关键对比数据！
    // console.log("【后端】ak:", ak);
    // console.log("【后端】sk:", authItem.sk);
    // console.log("【后端】timestamp:", timestamp);
    // console.log("【后端】原始请求体rawBody:", (rawBody));
    // const serverSignStr = `${ak}${authItem.sk}${timestamp}${rawBody}`;
    // console.log("【后端】拼接完整签名字符串:", serverSignStr);
  const pass = verifySign(ak, authItem.sk, timestamp, rawBody, signature);
  if (!pass) {
    return res.json({ code: 401, msg: "签名校验失败或请求过期" });
  }
  next();
}

module.exports = { authMiddleware };