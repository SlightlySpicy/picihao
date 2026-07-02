const mysql = require('mysql2/promise');

// ========== 这里修改你的数据库账号信息 ==========
const DB_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'appuser',    // 你的mysql用户
  password: 'R@n3km#2025!F6', // 自行填写密码
  database: 'bolt_batch',
  connectionLimit: 10,
  waitForConnections: true
};
// ==============================================

// 创建连接池
const pool = mysql.createPool(DB_CONFIG);

// 通用执行SQL函数
async function query(sql, params = []) {
    // console.log('执行SQL参数：', params);
  const [rows] = await pool.execute(sql, params);
  return rows;
}

module.exports = { pool, query };