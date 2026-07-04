CREATE TABLE `bolt_inuse` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `batch_no` varchar(20) NOT NULL COMMENT '批次号 26060001',
  `seq` int NOT NULL COMMENT '批次序列号',
  `product` varchar(30) NOT NULL COMMENT '产品规格 M24*45',
  `company` varchar(50) NOT NULL COMMENT '公司名称',
  `project` varchar(50) NOT NULL COMMENT '项目名称',
  `product_type` enum('扭剪','大六角') NOT NULL COMMENT '螺栓类型',
  `total_capacity` int NOT NULL DEFAULT '3000' COMMENT '单批总容量',
  `remaining` int NOT NULL COMMENT '批次剩余可用数量',
  `spec_names` json NOT NULL COMMENT '批次内所有规格数组 ["M24*40","M24*50"]',
  `spec_lengths` json NOT NULL COMMENT '对应长度数组 [40,50]',
  `create_time` datetime NOT NULL COMMENT '批次创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_batch_no` (`batch_no`),
  KEY `idx_company_project_type` (`company`,`project`,`product_type`),
  KEY `idx_spec_x` (`product`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='在用库存批次表' 

CREATE TABLE `bolt_rec` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='批次申请单据记录表'

CREATE TABLE `bolt_his` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='批次操作历史流水表'
