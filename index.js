const express = require('express');
const cors = require('cors');
const { runCli } = require('./src/cli/index');

const app = express();
const port = 3000;
app.use(cors());
app.use(express.json());

// 测试接口
app.get('/ping', (req, res) => res.json({code:200, msg:'服务正常'}));

// 创建批次接口
app.post('/api/createBatch', async (req, res) => {
  try {
    const { product, company, project, count, productType } = req.body;
    // 组装参数数组，传给改造后的runCli
    const argsArr = [product, company, project, String(count), productType];
    // 调用原有逻辑，拿到最终批次号
    const batchNo = await runCli(argsArr);
    res.json({
      code: 200,
      msg: '生成成功',
      finalBatch: batchNo
    });
  } catch (err) {
    res.json({
      code: 400,
      msg: err.message
    });
  }
});

app.listen(port, () => {
  console.log('API启动 http://127.0.0.1:3000');
});