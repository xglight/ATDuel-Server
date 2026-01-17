# ATDuel-Server

为 Atcoder 打造的 Duel，此项目为后端代码，前端代码见 [ATDuel-Client](https://github.com/xglight/ATDuel-Client)。

![](https://img.shields.io/badge/node-v22.13.1-blue) ![](https://img.shields.io/badge/npm-v11.1.0-blue)

## 说明

采用纯 Html+Node.js 开发，使用 [koa](https://koajs.com/) 框架，数据库使用 [MySQL](https://www.mysql.com/)。

文件夹 `api` 为后端 `API` 接口，`client` 为前段 js 逻辑，`tools` 为工具文件夹。

`server.mjs` 为后端入口文件，使用 `koa` 框架，启动 `API` 服务。

## 配置

服务器使用 `.env` 文件进行配置。你可以参考以下格式创建 `.env` 文件：

```env
# 服务器配置
SERVER_PROTOCOL=http
SERVER_HOST=localhost
SERVER_PORT=3000
SERVER_API_PREFIX=/api

# MySQL 配置
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=atduel

# 注册相关配置
REGISTER_RATING_LOWER_LIMIT=1000

# 内容相关配置
CONTENT_PEOPLE_LIMIT=3
CONTENT_PROBLEM_COUNT_LOWER_LIMIT=1
CONTENT_PROBLEM_COUNT_UPPER_LIMIT=10
CONTENT_TIME_LIMIT=86400

# 日志等级 (fatal, error, warn, info, debug, trace)
LOG_LEVEL=info
```

## 本地部署

1. **安装依赖**：
   ```bash
   npm install
   ```

2. **配置环境**：
   根据 `.env.example` 创建 `.env` 文件并配置数据库信息。

3. **初始化系统**：
   运行初始化脚本设置管理员账号：
   ```bash
   npm run init
   ```

4. **启动服务**：
   ```bash
   npm start
   ```

## API 接口

详见 `API.md`。