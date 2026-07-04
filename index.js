const express = require('express');
const cors = require('cors');
const { runCli } = require('./src/cli/index');
const { authMiddleware } = require('./src/config/auth'); //鉴权
const { createBatchSchema, validateParams } = require('./src/utils/validateUtil');

const app = express();
const port = 3000;
app.use(cors());
app.use(express.json());

// 原始body，用于签名校验
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString(); // 保存原始请求字符串
  }
}));

// 注册鉴权中间件（所有接口生效）
app.use(authMiddleware);

// 生产环境关闭详细错误堆栈返回
if (process.env.NODE_ENV === 'production') {
  app.set('env', 'production');
  app.set('debug', false);
} 

// 测试接口
app.get('/ping', (req, res) => res.json({code:200, msg:'服务正常'}));

// 创建批次接口
app.post('/api/batch', async (req, res) => {
  try {
     // 新增参数校验
    const check = validateParams(createBatchSchema, req.body);
    if (!check.pass) {
      return res.json({ code: 400, msg: check.msg });
    }
    // 使用清洗后的安全参数
    const { product, company, project, count, productType } = check.data;
    // const { product, company, project, count, productType } = req.body;
    // 组装参数数组，传给改造后的runCli
    const argsArr = [product, company, project, String(count), productType];
    // 调用原有逻辑，拿到最终批次号
    const batchNo = await runCli(argsArr);
    res.json({
      code: 200,
      msg: 'sunccess',
      finalBatch: batchNo
    });
  } catch (err) {
    res.json({
      code: 400,
      msg: err.message || "failed"
    });
  }
});

// 全局统一异常捕获中间件（放所有路由最后面）
app.use((err, req, res, next) => {
  console.error("服务异常：", err);
  // 只返回简洁提示，不暴露源码路径
  res.status(500).json({
    code: 500,
    msg: "服务器内部错误，请稍后重试"
  });
});

app.listen(port, () => {
  console.log('API启动 http://127.0.0.1:3000');
});