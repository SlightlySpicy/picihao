CREATE TABLE `batch_seq` (
  `yearmonth` VARCHAR(6) NOT NULL COMMENT '6位年月，如2607',
  `max_seq` INT NOT NULL DEFAULT 0 COMMENT '当前最大序列号',
  PRIMARY KEY (`yearmonth`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- 初始化
INSERT INTO batch_seq VALUES ('2607', 1);

CREATE TABLE `batch_spec` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
  -- 业务四元唯一维度
  `company` VARCHAR(100) NOT NULL COMMENT '公司',
  `project` VARCHAR(100) NOT NULL COMMENT '项目',
  `product_type` VARCHAR(20) NOT NULL COMMENT '扭剪/大六角',
  `spec_full` VARCHAR(30) NOT NULL COMMENT '完整规格 M16*90',
  -- 拆分字段，用于匹配、索引
  `spec_x` INT NOT NULL COMMENT '直径16',
  `spec_len` INT NOT NULL COMMENT '长度90',
  -- 关联物理批次
  `batch_no` VARCHAR(20) NOT NULL COMMENT '关联批次库存表',
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- 核心唯一约束：同一套业务+同一个规格，只能绑定一条批次
  UNIQUE KEY uk_biz_spec (`company`, `project`, `product_type`, `spec_full`),
  -- 检索索引1：同业务维度下所有同直径规格（复用匹配用）
  INDEX idx_biz_x (`company`, `project`, `product_type`, `spec_x`),
  -- 检索索引2：通过批次号反向查出所有绑定的规格业务
  INDEX idx_batch_no (`batch_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT '业务规格批次关联表';

CREATE TABLE `batch_inuse` (
  `batch_no` VARCHAR(20) NOT NULL PRIMARY KEY COMMENT '全局唯一批次号 26060003',
  `seq` INT NOT NULL COMMENT '批次自增序列号',
  `total_capacity` INT NOT NULL DEFAULT 3000 COMMENT '批次总容量',
  `remaining` INT NOT NULL COMMENT '批次全局剩余可用数量',
  `create_time` VARCHAR(50) NOT NULL COMMENT '批次创建时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT '批次库存';

CREATE TABLE `record` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `company` varchar(50) NOT NULL,
  `project` varchar(50) NOT NULL,
  `product` varchar(30) NOT NULL,
  `batch_string` varchar(500) NOT NULL COMMENT '最终拼接批次字符串',
  `total_count` int NOT NULL COMMENT '本次申请总数量',
  `create_time` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_company_project` (`company`,`project`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='批次申请单据记录表';

CREATE TABLE `history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `batch_no` varchar(20) NOT NULL COMMENT '操作批次号',
  `product` varchar(30) NOT NULL,
  `company` varchar(50) NOT NULL,
  `project` varchar(50) NOT NULL,
  `product_type` enum('扭剪','大六角') NOT NULL,
  `total_capacity` int NOT NULL,
  `use_count` int NOT NULL COMMENT '本次使用数量',
  `remaining` int NOT NULL COMMENT '操作后剩余数量',
  `status` enum('inuse','used') NOT NULL COMMENT '操作后状态',
  `action` varchar(30) NOT NULL COMMENT '操作类型：新建批次/复用(实验+长度匹配)/复用(仅长度匹配)',
  `action_time` datetime NOT NULL COMMENT '操作时间',
  PRIMARY KEY (`id`),
  KEY `idx_batch_no` (`batch_no`),
  KEY `idx_action_time` (`action_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='批次操作历史流水表';
