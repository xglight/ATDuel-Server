# ATDuel-Server

ATDuel-Server 是 ATDuel 平台的后端核心。基于 Node.js 开发，它负责处理业务逻辑、数据持久化、AtCoder 数据同步、实时通信以及比赛状态管理。

前段在这里：[ATDuel-Client](https://github.com/xglight/ATDuel-Client)

[![Node.js](https://img.shields.io/badge/node-v22.13.1-blue)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-v11.1.0-blue)](https://www.npmjs.com/)
[![License](https://img.shields.io/badge/license-GPL--3.0-green)](LICENSE)

## 🌟 核心特性

- **RESTful API**: 提供完整的后端接口支持，驱动前端业务流。详见 [API.md](API.md)。
- **AtCoder 深度集成**:
  - **身份验证**: 通过 AtCoder Affiliation 验证用户身份。
  - **数据抓取**: 自动获取用户头像、Rating 及所属团队。
- **比赛与房间系统**:
  - **实时通信**: 基于 WebSocket 的实时比赛状态更新、消息广播及聊天功能。
- **Rating 体系**: 
  - 针对团队对决优化的 ELO Rating 计算系统。
  - 详细算法说明请参考 [RATING.md](RATING.md)。
- **管理与安全**:
  - **权限控制**: 基于 Token 的管理员认证体系。
  - **审计日志**: 详细的操作日志记录与查询。
  - **安全防护**: 密码采用 `bcrypt` 加密存储，多维度封禁机制（用户/IP）。

## 📁 目录结构

```text
ATDuel-Server/
├── api/                # API 路由实现 (动态加载)
├── tools/              # 辅助工具 (CLI, 数据迁移, 缓存管理)
├── utils/              # 通用工具函数 (认证、加密等)
├── server.mjs          # 服务器启动入口
├── db.mjs              # 数据库连接池配置
├── table_definitions.mjs # 数据库表结构定义
├── config.mjs          # 全局配置管理
├── logger.mjs          # 日志记录模块
└── import_api.mjs      # 路由自动导入逻辑
```

## 🚀 本地部署

### 1. 准备工作

确保环境已安装 Node.js (建议 v22+) 和 MySQL。

### 2. 安装依赖

```bash
npm install
```

### 3. 环境配置

复制 `.env.example` 为 `.env` 并填写相关信息：

```env
DB_HOST=localhost
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=atduel
SERVER_PORT=3000
ADMIN_TOKEN=your_secret_admin_token
```

### 4. 初始化数据库

运行初始化脚本，它将自动创建表结构并引导你创建首个管理员账号：

```bash
npm run init
```

### 5. 启动服务

```bash
# 开发模式 (自动重载)
npm run dev

# 生产模式
npm start
```

## 📚 文档

- [API 接口文档](API.md)
- [Rating 算法详解](RATING.md)

## 🤝 如何参与

我们欢迎各种形式的贡献！你可以通过以下方式参与本项目：

1.  **提交 Issue**: 报告 Bug、提出新功能建议或询问问题。
2.  **提交 Pull Request**:
    - Fork 本仓库。
    - 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)。
    - 提交你的更改 (`git commit -m 'Add some AmazingFeature'`)。
    - 将更改推送到分支 (`git push origin feature/AmazingFeature`)。
    - 开启一个 Pull Request。
3.  **完善文档**: 修复文档中的错误或补充缺失的内容。

在参与贡献前，请确保你的代码符合项目的编码规范，并尽可能添加必要的测试。

## 📄 开源协议

本项目基于 [GPL-3.0](LICENSE) 协议开源。
