# API 文档

前缀：`http://${server}:${port}/${apiprefix}` (默认 apiprefix 为 `api`)

## 用户相关

### POST /login

#### 请求参数

|  参数名  |  类型  | 必填  | 描述   |
| :------: | :----: | :---: | :----- |
| username | string |  是   | 用户名 |
| password | string |  是   | 密码 (Base64 编码) |
|  token   | string |  s   | token  |
| rememberMe | int | 否 | 是否记住登录 (0: 否, 1: 是) |

#### 返回值

| 状态码 | 类型  | 描述             |
| :----: | :---: | :--------------- |
|  200   | json  | 登录成功         |
|  400   | json  | 参数缺失         |
|  401   | json  | 用户名或密码错误 |
|  403   | json  | 用户被封禁       |
|  404   | json  | 用户不存在       |
|  500   | json  | 服务器错误       |

---

### POST /check_login

#### 说明

检查用户的登录信息。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述   |
| :------: | :----: | :---: | :----- |
| username | string |  是   | 用户名 |
|  token   | string |  是   | token  |

#### 返回值

| 状态码 | 类型  | 描述       |
| :----: | :---: | :--------- |
|  200   | json  | 登录有效   |
|  400   | json  | 参数缺失   |
|  401   | json  | 未登录或已过期 |
|  403   | json  | 用户被封禁 |
|  500   | json  | 服务器错误 |

---

### GET /check/:username

#### 说明

获取用户在 AtCoder 上的 Affiliation (用于验证注册)。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述           | 位置  |
| :------: | :----: | :---: | :------------- | :---: |
| username | string |  是   | Atcoder 用户名 | path  |

#### 返回值

| 状态码 | 类型  | 描述       |
| :----: | :---: | :--------- |
|  200   | string | Affiliation 信息 |
|  400   | string | 参数缺失   |
|  404   | string | 用户不存在 |
|  500   | string | 服务器错误 |

---

### POST /logout

#### 说明

登出用户。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述   |
| :------: | :----: | :---: | :----- |
| username | string |  是   | 用户名 |
|  token   | string |  是   | token  |

#### 返回值

| 状态码 | 类型  | 描述       |
| :----: | :---: | :--------- |
|  200   | text  | 登出成功   |
|  400   | json  | 参数缺失   |
|  401   | json  | 用户或登录信息不存在 |
|  500   | text  | 服务器错误 |

---

### POST /register

#### 说明

用户注册。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述          |
| :------: | :----: | :---: | :------------ |
| username | string |  是   | ATDuel 用户名 |
| password | string |  是   | 密码          |
|  ATName  | string |  是   | AtCoder 用户名 |

#### 返回值

| 状态码 | 类型  | 描述                   |
| :----: | :---: | :--------------------- |
|  200   | json  | 注册成功               |
|  400   | json  | 参数缺失/用户名已存在/AtCoder名已存在/Rating不足 |
|  500   | json  | 服务器错误             |

---

### GET /avatar/:username

#### 说明

获取用户 ATDuel 的头像 URL。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述          | 位置  |
| :------: | :----: | :---: | :------------ | :---: |
| username | string |  是   | ATDuel 用户名 | path  |

#### 返回值

| 状态码 |  类型  | 描述       |
| :----: | :----: | :--------- |
|  200   | string | 头像 URL   |
|  400   |  json  | 参数缺失   |
|  404   |  text  | 用户不存在 |
|  500   |  text  | 服务器错误 |

---

### GET /duelname/:username

#### 说明

根据 AtCoder 用户名获取用户 ATDuel 的用户名。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述           | 位置  |
| :------: | :----: | :---: | :------------- | :---: |
| username | string |  是   | AtCoder 用户名 | path  |

#### 返回值

| 状态码 |     类型      | 描述       |
| :----: | :-----------: | :--------- |
|  200   | string | ATDuel 用户名 |
|  400   |     json      | 参数缺失   |
|  404   |     json      | 用户不存在 |
|  500   |     json      | 服务器错误 |

---

### GET /atname/:username

#### 说明

根据 ATDuel 用户名获取用户 AtCoder 的用户名。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述           | 位置  |
| :------: | :----: | :---: | :------------- | :---: |
| username | string |  是   | ATDuel 用户名 | path  |

#### 返回值

| 状态码 |     类型      | 描述       |
| :----: | :-----------: | :--------- |
|  200   | string | AtCoder 用户名 |
|  400   |     json      | 参数缺失   |
|  404   |     json      | 用户不存在 |
|  500   |     json      | 服务器错误 |

---

### GET /rating/:username

#### 说明

获取用户 ATDuel 的 Rating。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述           | 位置  |
| :------: | :----: | :---: | :------------- | :---: |
| username | string |  是   | ATDuel 用户名 | path  |

#### 返回值

| 状态码 | 类型  | 描述       |
| :----: | :---: | :--------- |
|  200   |  int  | 用户 Rating   |
|  400   | json  | 参数缺失   |
|  404   | json  | 用户不存在 |
|  500   | text  | 服务器错误 |

---

### GET /user_contest/:username

#### 说明

获取指定用户的比赛历史。

#### 返回值

| 状态码 | 类型 | 描述 |
| :---: | :---: | :--- |
| 200 | json | 比赛历史列表 |
| 400 | json | 参数缺失 |
| 500 | json | 服务器错误 |

---

### GET /user_contestid/:username

#### 说明

获取指定用户参加过的所有比赛 ID 列表。

#### 返回值

| 状态码 | 类型 | 描述 |
| :---: | :---: | :--- |
| 200 | json | 比赛 ID 数组 |
| 400 | json | 参数缺失 |
| 500 | json | 服务器错误 |

---

### POST /user_ac_update

#### 说明

手动触发从 AtCoder 同步用户的 AC 记录。

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
| :---: | :---: | :---: | :--- |
| username | string | 是 | ATDuel 用户名 |

---

## 比赛相关

### GET /contests

#### 说明

获取所有比赛的简要信息列表。

#### 返回值

| 状态码 | 类型  | 描述         |
| :----: | :---: | :----------- |
|  200   | json  | 比赛列表 |
|  500   | text  | 服务器错误   |

---

### GET /contest/:id

#### 说明

获取指定比赛的详细信息 (包括队伍、成员、题目、提交、Rating 变动等)。

#### 请求参数

| 参数名 |  类型  | 必填  | 描述   | 位置  |
| :----: | :----: | :---: | :----- | :---: |
|   id   | string |  是   | 比赛 URL ID | path  |

#### 返回值

| 状态码 | 类型  | 描述       |
| :----: | :---: | :--------- |
|  200   | json  | 比赛详情   |
|  404   | text  | 比赛不存在 |
|  500   | text  | 服务器错误 |

---

### POST /contest_start

#### 说明

开始比赛。从房间配置中生成题目并初始化比赛数据。

#### 请求参数

| 参数名 |  类型  | 必填  |  描述  |
| :----: | :----: | :---: | :----: |
| room_id | string |  是   | 房间 URL ID |

---

### POST /contest_ac

#### 说明

当用户 AC 题目时，更新比赛分数和题目状态。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述   |
| :-------: | :----: | :---: | :----- |
| contestId | string |  是   | 比赛 URL ID |
| username  | string |  是   | ATDuel 用户名 |
|   title   | string |  是   | 题目名 (包含编号) |

---

### POST /submission_update

#### 说明

更新比赛中的提交记录。

#### 请求参数

|   参数名    |  类型  | 必填  | 描述   |
| :---------: | :----: | :---: | :----- |
| problemTitle| string |  是   | 题目名 |
|  contestId  | string |  是   | 比赛 URL ID |
|  username   | string |  是   | 当前请求用户名 |
|   token     | string |  是   | 用户 token |

---

### POST /contest_final

#### 说明

结束比赛并结算 Rating。

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
| :---: | :---: | :---: | :--- |
| contestId | string | 是 | 比赛 URL ID |
| team | string | 否 | 触发结算的队伍 |

---

### GET /submission/:contestId

#### 说明

分页获取指定比赛的提交记录。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述     | 位置  |
| :-------: | :----: | :---: | :------- | :---- |
| contestId | string |  是   | 比赛 URL ID   | path  |
|   page    |  int   |  否   | 页数 (默认 1) | query |
| pageSize  |  int   |  否   | 每页数量 (默认 10) | query |

---

### POST /request_change_problem

#### 说明

在比赛中发起换题请求。

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
| :---: | :---: | :---: | :--- |
| contestId | string | 是 | 比赛 URL ID |
| problemId | string | 是 | 题目 ID |
| username | string | 是 | 发起者用户名 |
| token | string | 是 | 发起者 token |

---

### POST /respond_change_problem

#### 说明

响应对方发起的换题请求。

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
| :---: | :---: | :---: | :--- |
| contestId | string | 是 | 比赛 URL ID |
| requestId | string | 是 | 请求 ID |
| action | string | 是 | `accept` 或 `reject` |
| username | string | 是 | 响应者用户名 |
| token | string | 是 | 响应者 token |

---

## 房间相关

### GET /rooms

#### 说明

获取所有房间的信息列表。

#### 返回值

| 状态码 | 类型  | 描述         |
| :----: | :---: | :----------- |
|  200   | json  | 房间列表 |
|  500   | text  | 服务器错误   |

---

### GET /room/:id

#### 说明

获取指定房间的详细信息。

#### 请求参数

| 参数名 |  类型  | 必填  | 描述   | 位置  |
| :----: | :----: | :---: | :----- | :---: |
|   id   | string |  是   | 房间 URL ID | path  |

---

### POST /room_create

#### 说明

创建房间。

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
| :---: | :---: | :---: | :--- |
| username | string | 是 | 房主用户名 |
| token | string | 是 | 房主 token |
| playerCount | string | 否 | 模式 (如 `1v1`, `2v2`) |
| isRated | bool | 否 | 是否 Rated |
| ratingMin | int | 否 | 难度下限 |
| ratingMax | int | 否 | 难度上限 |
| problemCount | int | 否 | 题目数量 |

---

### POST /room_delete

#### 说明

删除房间。

#### 请求参数

| 参数名 |  类型  | 必填  | 描述   |
| :----: | :----: | :---: | :----- |
| room_id | string |  是   | 房间 URL ID |

---

### POST /room_ready

#### 说明

更新房间内用户的准备状态。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述     |
| :------: | :----: | :---: | :------- |
| room_id  | string |  是   | 房间 URL ID |
|   team   | string |  是   | 队伍 (`A` 或 `B`) |
| position |  int   |  是   | 队伍内位置 |
|  ready   |  bool  |  是   | 是否准备 |

---

### POST /room_user_update

#### 说明

更新房间内的用户信息 (加入或退出房间/队伍)。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述                       |
| :------: | :----: | :---: | :------------------------- |
|  roomId  | string |  是   | 房间 URL ID                     |
|    op    |  int   |  是   | 操作 (0: 退出, 1: 加入) |
|   team   |  int   |  是   | 队伍 (1: A, 2: B) |
| username | string |  是   | 用户名 |
|   pos    |  int   |  否   | 位置 (仅加入时有效) |

---

## Atcoder 相关

### GET /atavatar/:username

#### 说明

直接从 AtCoder 抓取用户的头像。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述          | 位置  |
| :------: | :----: | :---: | :------------ | :---: |
| username | string |  是   | AtCoder 用户名 | path  |

#### 返回值

| 状态码 |  类型  | 描述       |
| :----: | :----: | :--------- |
|  200   | string | 头像 URL   |
|  404   |  text  | 未找到     |
|  500   |  text  | 服务器错误 |

---

### GET /atRating/:username

#### 说明

直接从 AtCoder 抓取用户的当前 Rating。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述          | 位置  |
| :------: | :----: | :---: | :------------ | :---: |
| username | string |  是   | AtCoder 用户名 | path  |

#### 返回值

| 状态码 | 类型  | 描述       |
| :----: | :---: | :--------- |
|  200   |  int  | 用户 Rating   |
|  404   | text  | 未找到 |
|  500   | text  | 服务器错误 |

---

### POST /user_submissions

#### 说明

获取 AtCoder 用户的提交记录 (通常用于同步)。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述          |
| :------: | :----: | :---: | :------------ |
| username | string |  是   | AtCoder 用户名 |
| problem_id | string |  是   | 题目 ID        |
| startTime | string | 是 | 比赛开始时间 |

---

## 管理员相关

### POST /admin/login

#### 说明

管理员登录。

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
| :---: | :---: | :---: | :--- |
| username | string | 否 | 管理员用户名 (默认 `admin`) |
| password | string | 是 | 密码 |
| token | string | 是 | 登录 token |

---

### POST /admin/check

#### 说明

检查管理员登录状态。

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
| :---: | :---: | :---: | :--- |
| token | string | 是 | 管理员 token |

---

### POST /admin/users

#### 说明

获取所有注册用户信息 (需管理员权限)。

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
| :---: | :---: | :---: | :--- |
| token | string | 是 | 管理员 token |
| query | string | 否 | 搜索过滤字符串 |

---

### POST /admin/ban

#### 说明

封禁用户 (需管理员权限)。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述     |
| :------: | :----: | :---: | :------- |
| username | string |  是   | 用户名   |
|  token   | string |  是   | 管理员 token |
|  reason  | string |  否   | 封禁原因 |
| endBanTime| string |  是   | 封禁截止时间 |

---

### POST /admin/unban

#### 说明

解封用户 (需管理员权限)。

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
| :---: | :---: | :---: | :--- |
| username | string | 是 | 用户名 |
| token | string | 是 | 管理员 token |

---

### POST /admin/logs

#### 说明

获取服务器日志 (需管理员权限)。

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
| :---: | :---: | :---: | :--- |
| token | string | 是 | 管理员 token |
| date | string | 否 | 指定日期 (如 `2024-01-01`), 不传则返回最新日志 |

---

## 系统相关

### GET /config

#### 说明

获取前端所需的公开配置信息 (如注册限制、题目限制等)。

---

### GET /health

#### 说明

检查服务健康状态，返回系统运行时间及用户、比赛、房间数量。
