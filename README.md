# ATDuel-Server

ATDuel-Server 是 ATDuel 平台的后端核心，负责处理所有的业务逻辑、数据存储、AtCoder 数据同步以及比赛状态维护。

![](https://img.shields.io/badge/node-v22.13.1-blue) ![](https://img.shields.io/badge/npm-v11.1.0-blue)

## 说明

采用 Node.js 环境下的 [Koa](https://koajs.com/) 框架开发，使用 [MySQL](https://www.mysql.com/) 作为持久化存储。

## 核心功能

- **API 驱动**: 完整的 RESTful API 接口，详见 [API.md](API.md)。
- **AtCoder 集成**:
  - 自动获取用户头像、Rating 和所属团队信息。
  - 实时爬取和更新用户的 Submission 记录。
- **比赛逻辑**:
  - 房间管理与比赛初始化。
  - 自动判题与 AC 状态同步。
  - 复杂的团队 ELO Rating 计算系统，详见 [RATING.md](RATING.md)。
- **管理功能**:
  - 管理员 Token 验证。
  - 用户封禁/解封、系统日志查看、全局配置动态获取。
- **安全性**: 采用 `bcrypt` 进行密码哈希存储，基于 `uuid` 的 Token 管理。

## 目录结构

- `api/`: 所有 API 接口的实现，采用动态路由加载机制。
- `tools/`: 工具类代码，包括数据库初始化脚本、命令行工具、缓存管理等。
- `db.mjs`: 数据库连接池配置。
- `server.mjs`: 服务器入口，初始化 Koa 实例并加载中间件。
- `table_definitions.mjs`: 数据库表结构定义。

## 本地部署

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境

复制 `.env.example` 为 `.env` 并修改相关配置（数据库、服务器端口等）。

### 3. 初始化数据库

运行初始化脚本，该脚本会创建必要的表并提示你创建第一个管理员账号：

```bash
npm run init
```

### 4. 启动服务

```bash
# 开发模式 (使用 nodemon)
npm run dev

# 生产模式
npm start
```

## 文档参考

- **API 接口**: [API.md](API.md)
- **Rating 算法**: [RATING.md](RATING.md)

## 开源协议

本项目采用 [MIT License](LICENSE) 协议。
