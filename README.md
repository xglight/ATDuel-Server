# ATDuel-Server

为 Atcoder 打造的 Duel，此项目为后端代码，前端代码见 [ATDuel-Client](https://github.com/xglight/ATDuel-Client)。

![](https://img.shields.io/badge/node-v22.13.1-blue) ![](https://img.shields.io/badge/npm-v11.1.0-blue)

## 说明

采用纯 Html+Node.js 开发，使用 [koa](https://koajs.com/) 框架，数据库使用 [MySQL](https://www.mysql.com/)。

文件夹 `api` 为后端 `API` 接口，`client` 为前段 js 逻辑，`tools` 为工具文件夹。

`config.json` 为配置文件。

`server.mjs` 为后端入口文件，使用 `koa` 框架，启动 `API` 服务。

## 本地部署

```bash
git clone https://github.com/xglight/ATDuel.git
cd ATDuel
npm install
node server.mjs # 启动后端
```

## API 接口

详见 `API.md`。