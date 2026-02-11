# API 文档

<button onclick="copyApiDoc()" id="copyBtn" style="cursor:pointer;padding:6px 12px;background:#28a745;color:white;border:none;border-radius:4px;margin-bottom:20px;font-size:14px;">
    <i class="fas fa-copy"></i> 复制文档内容
</button>

<script>
function copyApiDoc() {
    const text = document.body.innerText.replace('复制文档内容', '').trim();
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copyBtn');
        const oldText = btn.innerText;
        btn.innerText = '已复制！';
        btn.style.background = '#17a2b8';
        setTimeout(() => {
            btn.innerText = oldText;
            btn.style.background = '#28a745';
        }, 2000);
    });
}
</script>

前缀：`http://${server}:${port}/${apiprefix}` (默认 apiprefix 为 `api`)

## 认证说明

本系统采用 **HttpOnly Cookie** 进行认证。
- 登录后，服务器会设置 `token` (HttpOnly) 和 `username` Cookie。
- 管理员登录后，服务器会额外设置 `admin_token` (HttpOnly) Cookie。
- 所有需要验证的接口都会自动从 Cookie 中提取认证信息，**不需要**在请求体中手动发送 `token` 或 `admin_token`。
- WebSocket 连接在握手阶段通过 Cookie 进行鉴权。

**重要提示：**
由于采用了 Cookie 认证，客户端（前端）在进行跨域请求时，必须在 `fetch` 请求中设置 `credentials: 'include'`，否则 Cookie 将不会被发送到服务器，导致认证失败。

## 用户相关

### POST /login

#### 请求参数

|   参数名   |  类型  | 必填  | 描述                        |
| :--------: | :----: | :---: | :-------------------------- |
|  username  | string |  是   | 用户名                      |
|  password  | string |  是   | 密码 (Base64 编码)          |
| rememberMe |  int   |  否   | 是否记住登录 (0: 否, 1: 是) |

#### 返回值

| 状态码 | 类型  | 描述                                                                                   |
| :----: | :---: | :------------------------------------------------------------------------------------- |
|  200   | json  | { success: true, message: "登录成功" } (同时设置 HttpOnly Cookie: `username`, `token`) |
|  400   | json  | { success: false, message: "用户名和密码不能为空" }                                    |
|  401   | json  | { success: false, message: "用户名或密码错误" }                                        |
|  403   | json  | { success: false, message: "您已被封禁至...，原因: ..." }                              |
|  500   | json  | { success: false, message: "服务器内部错误" }                                          |

---

### POST /check_login

#### 说明

检查用户的登录状态（通过 Cookie 验证）。验证成功后会自动续期 Cookie 有效期。

#### 请求参数

无 (通过 Cookie 自动验证)

#### 返回值

| 状态码 | 类型  | 描述                                                              |
| :----: | :---: | :---------------------------------------------------------------- |
|  200   | json  | { success: true, message: "登录有效", data: { username: "..." } } |
|  401   | json  | { success: false, message: "未登录或已过期" }                     |
|  403   | json  | { success: false, message: "用户被封禁" }                         |
|  500   | json  | { success: false, message: "服务器错误" }                         |

---

### GET /check/:username

#### 说明

获取用户在 AtCoder 上的 Affiliation (用于验证注册)。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述           | 位置  |
| :------: | :----: | :---: | :------------- | :---: |
| username | string |  是   | Atcoder 用户名 | path  |

#### 返回值

| 状态码 | 类型  | 描述                                            |
| :----: | :---: | :---------------------------------------------- |
|  200   | json  | { success: true, data: "Affiliation" }          |
|  400   | json  | { success: false, message: "用户名不能为空" }   |
|  404   | json  | { success: false, message: "AtCoder 用户存在" } |
|  500   | json  | { success: false, message: "服务器内部错误" }   |

---

### POST /logout

#### 说明

登出当前账号（通过 Cookie 验证并清除服务器记录）。

#### 请求参数

无 (通过 Cookie 自动验证)

#### 返回值

| 状态码 | 类型  | 描述                                          |
| :----: | :---: | :-------------------------------------------- |
|  200   | json  | { success: true, message: "登出成功" }        |
|  401   | json  | { success: false, message: "未登录或已过期" } |
|  500   | json  | { success: false, message: "服务器错误" }     |

---

### POST /find_password

#### 说明

找回密码。通过验证 AtCoder 账号的 Affiliation 字段（需填入指定的 verifyToken）来重置密码。

#### 请求参数

|   参数名    |  类型  | 必填  | 描述                 |
| :---------: | :----: | :---: | :------------------- |
|  username   | string |  是   | 用户名               |
|   ATName    | string |  是   | AtCoder 用户名       |
| newPassword | string |  是   | 新密码 (Base64 编码) |
| verifyToken | string |  是   | 验证用的 Token       |

#### 返回值

| 状态码 | 类型  | 描述                                                         |
| :----: | :---: | :----------------------------------------------------------- |
|  200   | json  | { success: true, message: "密码重置成功，请使用新密码登录" } |
|  400   | json  | { success: false, message: "参数缺失、不匹配或校验码错误" }  |
|  500   | json  | { success: false, message: "服务器内部错误" }                |

---

### POST /register

#### 说明

用户注册。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述               |
| :------: | :----: | :---: | :----------------- |
| username | string |  是   | ATDuel 用户名      |
| password | string |  是   | 密码 (Base64 编码) |
|  ATName  | string |  是   | AtCoder 用户名     |

#### 返回值

| 状态码 | 类型  | 描述                                                                            |
| :----: | :---: | :------------------------------------------------------------------------------ |
|  200   | json  | { success: true, message: "注册成功" }                                          |
|  400   | json  | { success: false, message: "参数缺失/用户名已存在/AtCoder名已存在/Rating不足" } |
|  500   | json  | { success: false, message: "服务器错误" }                                       |

---

### POST /change_password

#### 说明

修改用户密码（通过 Cookie 验证）。

#### 请求参数

|   参数名    |  类型  | 必填  | 描述                 |
| :---------: | :----: | :---: | :------------------- |
| oldPassword | string |  是   | 旧密码 (Base64 编码) |
| newPassword | string |  是   | 新密码 (Base64 编码) |

#### 返回值

| 状态码 | 类型  | 描述                                                |
| :----: | :---: | :-------------------------------------------------- |
|  200   | json  | { success: true, message: "密码修改成功" }          |
|  400   | json  | { success: false, message: "参数缺失" }             |
|  401   | json  | { success: false, message: "未登录或当前密码错误" } |
|  404   | json  | { success: false, message: "用户不存在" }           |
|  500   | json  | { success: false, message: "服务器错误" }           |

---

### GET /avatar/:username

#### 说明

获取用户 ATDuel 的头像路径。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述          | 位置  |
| :------: | :----: | :---: | :------------ | :---: |
| username | string |  是   | ATDuel 用户名 | path  |

#### 返回值

| 状态码 | 类型  | 描述                                      |
| :----: | :---: | :---------------------------------------- |
|  200   | json  | { success: true, data: "头像路径" }       |
|  400   | json  | { success: false, message: "参数缺失" }   |
|  404   | json  | { success: false, message: "用户不存在" } |
|  500   | json  | { success: false, message: "服务器错误" } |

---

### GET /duelname/:username

#### 说明

根据 AtCoder 用户名获取用户 ATDuel 的用户名。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述           | 位置  |
| :------: | :----: | :---: | :------------- | :---: |
| username | string |  是   | AtCoder 用户名 | path  |

#### 返回值

| 状态码 | 类型  | 描述                                      |
| :----: | :---: | :---------------------------------------- |
|  200   | json  | { success: true, data: "ATDuel 用户名" }  |
|  400   | json  | { success: false, message: "参数缺失" }   |
|  404   | json  | { success: false, message: "用户不存在" } |
|  500   | json  | { success: false, message: "服务器错误" } |

---

### GET /atname/:username

#### 说明

根据 ATDuel 用户名获取用户 AtCoder 的用户名。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述          | 位置  |
| :------: | :----: | :---: | :------------ | :---: |
| username | string |  是   | ATDuel 用户名 | path  |

#### 返回值

| 状态码 | 类型  | 描述                                      |
| :----: | :---: | :---------------------------------------- |
|  200   | json  | { success: true, data: "AtCoder 用户名" } |
|  400   | json  | { success: false, message: "参数缺失" }   |
|  404   | json  | { success: false, message: "用户不存在" } |
|  500   | json  | { success: false, message: "服务器错误" } |

---

### GET /rating/:username

#### 说明

获取用户 ATDuel 的 Rating。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述          | 位置  |
| :------: | :----: | :---: | :------------ | :---: |
| username | string |  是   | ATDuel 用户名 | path  |

#### 返回值

| 状态码 | 类型  | 描述                                      |
| :----: | :---: | :---------------------------------------- |
|  200   | json  | { success: true, data: 1200 }             |
|  400   | json  | { success: false, message: "参数缺失" }   |
|  404   | json  | { success: false, message: "用户不存在" } |
|  500   | json  | { success: false, message: "服务器错误" } |

---

### GET /user_contest/:username

#### 说明

获取指定用户的比赛历史。

#### 返回值

| 状态码 | 类型  | 描述                                      |
| :----: | :---: | :---------------------------------------- |
|  200   | json  | { success: true, data: [...] }            |
|  400   | json  | { success: false, message: "参数缺失" }   |
|  500   | json  | { success: false, message: "服务器错误" } |

---

### GET /user_contestid/:username

#### 说明

获取指定用户参加过的所有比赛 ID 列表。

#### 返回值

| 状态码 | 类型  | 描述                                      |
| :----: | :---: | :---------------------------------------- |
|  200   | json  | { success: true, data: [...] }            |
|  400   | json  | { success: false, message: "参数缺失" }   |
|  500   | json  | { success: false, message: "服务器错误" } |

---

### POST /user_ac_update

#### 说明

手动触发从 AtCoder 同步用户的 AC 记录。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述          |
| :------: | :----: | :---: | :------------ |
| username | string |  是   | ATDuel 用户名 |

#### 返回值

| 状态码 | 类型  | 描述                                      |
| :----: | :---: | :---------------------------------------- |
|  200   | json  | { success: true, message: "同步成功" }    |
|  400   | json  | { success: false, message: "参数缺失" }   |
|  500   | json  | { success: false, message: "服务器错误" } |

---

## 比赛相关

### GET /contests

#### 说明

获取所有比赛的简要信息列表。

#### 返回值

| 状态码 | 类型  | 描述                           |
| :----: | :---: | :----------------------------- |
|  200   | json  | { success: true, data: [...] } |
|  500   | json  | 服务器错误                     |

---

### GET /contest/:id

#### 说明

获取指定比赛的详细信息 (包括队伍、成员、题目、提交、Rating 变动等)。

#### 请求参数

| 参数名 |  类型  | 必填  | 描述        | 位置  |
| :----: | :----: | :---: | :---------- | :---: |
|   id   | string |  是   | 比赛 URL ID | path  |

#### 返回值

| 状态码 | 类型  | 描述                           |
| :----: | :---: | :----------------------------- |
|  200   | json  | { success: true, data: {...} } |
|  400   | json  | 比赛 URL 不能为空              |
|  404   | json  | 未找到该比赛                   |
|  500   | json  | 服务器错误                     |

---

### POST /contest_start

#### 说明

开始比赛（通过 Cookie 验证）。从房间配置中生成题目并初始化比赛数据。

#### 请求参数

| 参数名  |  类型  | 必填  |   描述   |
| :-----: | :----: | :---: | :------: |
| room_id | string |  是   | 房间 URL |

#### 返回值

| 状态码 | 类型  | 描述                                                       |
| :----: | :---: | :--------------------------------------------------------- |
|  200   | json  | { success: true, message: "比赛已开始", contestId: "..." } |
|  400   | json  | { success: false, message: "房间 ID 不能为空" }            |
|  401   | json  | { success: false, message: "未登录或已过期" }              |
|  404   | json  | { success: false, message: "未找到该房间" }                |
|  500   | json  | { success: false, message: "服务器内部错误" }              |

---

### POST /contest_ac

#### 说明

更新比赛 AC 状态（通过 Cookie 验证）。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述              |
| :-------: | :----: | :---: | :---------------- |
| contestId | string |  是   | 比赛 URL          |
|   title   | string |  是   | 题目名 (包含编号) |

#### 返回值

| 状态码 | 类型  | 描述                                          |
| :----: | :---: | :-------------------------------------------- |
|  200   | json  | { success: true, message: "分数已更新" }      |
|  401   | json  | { success: false, message: "未登录或已过期" } |
|  500   | json  | { success: false, message: "服务器错误" }     |

---

### POST /submission_update

#### 说明

更新提交记录（通过 Cookie 验证）。

#### 请求参数

|    参数名    |  类型  | 必填  | 描述     |
| :----------: | :----: | :---: | :------- |
| problemTitle | string |  是   | 题目标题 |
|  contestId   | string |  是   | 比赛 URL |

#### 返回值

| 状态码 | 类型  | 描述                                          |
| :----: | :---: | :-------------------------------------------- |
|  200   | json  | { success: true, message: "提交记录已更新" }  |
|  401   | json  | { success: false, message: "未登录或已过期" } |
|  403   | json  | { success: false, message: "非比赛参赛者" }   |
|  404   | json  | { success: false, message: "比赛不存在" }     |
|  500   | json  | { success: false, message: "服务器错误" }     |

---

### POST /contest_final

#### 说明

结束比赛并结算 Rating（需要管理员权限，通过 Cookie 验证）。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述        |
| :-------: | :----: | :---: | :---------- |
| contestId | string |  是   | 比赛 URL ID |

#### 返回值

| 状态码 | 类型  | 描述                                              |
| :----: | :---: | :------------------------------------------------ |
|  200   | json  | { success: true, message: "结算成功" }            |
|  401   | json  | { success: false, message: "管理员权限校验失败" } |
|  500   | json  | { success: false, message: "服务器错误" }         |

---

### GET /submission/:contestId

#### 说明

分页获取指定比赛的提交记录。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述               | 位置  |
| :-------: | :----: | :---: | :----------------- | :---- |
| contestId | string |  是   | 比赛 URL ID        | path  |
|   page    |  int   |  否   | 页数 (默认 1)      | query |
| pageSize  |  int   |  否   | 每页数量 (默认 10) | query |

#### 返回值

| 状态码 | 类型  | 描述                                                        |
| :----: | :---: | :---------------------------------------------------------- |
|  200   | json  | { success: true, data: { submissions: [...], total: ... } } |
|  400   | json  | { success: false, message: "参数无效" }                     |
|  404   | json  | { success: false, message: "未找到该比赛" }                 |
|  500   | json  | { success: false, message: "服务器错误" }                   |

---

### POST /request_change_problem

#### 说明

发起换题请求（通过 Cookie 验证）。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述     |
| :-------: | :----: | :---: | :------- |
| contestId | string |  是   | 比赛 URL |
| problemId | string |  是   | 题目 ID  |

#### 返回值

| 状态码 | 类型  | 描述                                          |
| :----: | :---: | :-------------------------------------------- |
|  200   | json  | { success: true, message: "请求发起成功" }    |
|  401   | json  | { success: false, message: "未登录或已过期" } |
|  500   | json  | { success: false, message: "服务器错误" }     |

---

### POST /respond_change_problem

#### 说明

响应对方发起的换题请求（通过 Cookie 验证）。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述                               |
| :-------: | :----: | :---: | :--------------------------------- |
| contestId | string |  是   | 比赛 URL                           |
| requestId | string |  是   | 请求 ID                            |
|  action   | string |  是   | `accept` (接受) 或 `reject` (拒绝) |

#### 返回值

| 状态码 | 类型  | 描述                                          |
| :----: | :---: | :-------------------------------------------- |
|  200   | json  | { success: true, message: "响应处理成功" }    |
|  401   | json  | { success: false, message: "未登录或已过期" } |
|  500   | json  | { success: false, message: "服务器错误" }     |

---

### POST /contest_action_request

#### 说明

发起平局或认输请求（通过 Cookie 验证）。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述                             |
| :-------: | :----: | :---: | :------------------------------- |
| contestId | string |  是   | 比赛 URL                         |
|   type    | string |  是   | 请求类型 ("draw" 或 "surrender") |

#### 返回值

| 状态码 | 类型  | 描述                                          |
| :----: | :---: | :-------------------------------------------- |
|  200   | json  | { success: true, message: "请求发起成功" }    |
|  401   | json  | { success: false, message: "未登录或已过期" } |
|  500   | json  | { success: false, message: "服务器错误" }     |

---

### POST /contest/vote_action

#### 说明

参与平局或认输请求的投票（通过 Cookie 验证）。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述                                         |
| :-------: | :----: | :---: | :------------------------------------------- |
| contestId | string |  是   | 比赛 URL                                     |
| requestId | string |  是   | 请求 ID                                      |
|  action   | string |  是   | 响应动作: `accept` (同意) 或 `reject` (拒绝) |

#### 返回值

| 状态码 | 类型  | 描述                                          |
| :----: | :---: | :-------------------------------------------- |
|  200   | json  | { success: true, message: "投票成功" }        |
|  401   | json  | { success: false, message: "未登录或已过期" } |
|  500   | json  | { success: false, message: "服务器错误" }     |

---

## 房间相关

### GET /rooms

#### 说明

获取所有房间的信息列表。

#### 返回值

| 状态码 | 类型  | 描述                                      |
| :----: | :---: | :---------------------------------------- |
|  200   | json  | { success: true, data: [...] }            |
|  500   | json  | { success: false, message: "服务器错误" } |

---

### GET /room/:id

#### 说明

获取指定房间的详细信息。

#### 请求参数

| 参数名 |  类型  | 必填  | 描述        | 位置  |
| :----: | :----: | :---: | :---------- | :---: |
|   id   | string |  是   | 房间 URL ID | path  |

#### 返回值

| 状态码 | 类型  | 描述                           |
| :----: | :---: | :----------------------------- |
|  200   | json  | { success: true, data: {...} } |
|  404   | json  | 房间不存在                     |
|  500   | json  | 服务器错误                     |

---

### POST /room_create

#### 说明

创建新房间（通过 Cookie 验证）。

#### 请求参数

|   参数名   |  类型  | 必填  | 描述                         |
| :--------: | :----: | :---: | :--------------------------- |
|    name    | string |  是   | 房间名称                     |
| is_private |  int   |  否   | 是否私有 (0: 否, 1: 是)      |
|  password  | string |  否   | 房间密码 (如果 is_private=1) |

#### 返回值

| 状态码 | 类型  | 描述                                          |
| :----: | :---: | :-------------------------------------------- |
|  200   | json  | { success: true, data: { roomId: "..." } }    |
|  401   | json  | { success: false, message: "未登录或已过期" } |
|  500   | json  | { success: false, message: "服务器错误" }     |

---

### POST /room_user_update

#### 说明

更新房间成员状态 (加入/退出/切换位置)（通过 Cookie 验证）。

#### 请求参数

| 参数名 |  类型  | 必填  | 描述                             |
| :----: | :----: | :---: | :------------------------------- |
| roomId | string |  是   | 房间 URL                         |
|   op   |  int   |  是   | 操作类型 (0: 退出, 1: 加入/切换) |
|  team  |  int   |  否   | 队伍编号 (1: Team A, 2: Team B)  |
|  pos   |  int   |  否   | 位置编号 (0-2)                   |

#### 返回值

| 状态码 | 类型  | 描述                                          |
| :----: | :---: | :-------------------------------------------- |
|  200   | json  | { success: true, data: {...} }                |
|  401   | json  | { success: false, message: "未登录或已过期" } |
|  500   | json  | { success: false, message: "服务器错误" }     |

---

### POST /room_ready

#### 说明

更新用户在房间内的准备状态（通过 Cookie 验证）。

#### 请求参数

| 参数名 |  类型   | 必填  | 描述       |
| :----: | :-----: | :---: | :--------- |
| roomId | string  |  是   | 房间 URL   |
| ready  | boolean |  是   | 是否准备好 |

#### 返回值

| 状态码 | 类型  | 描述                                          |
| :----: | :---: | :-------------------------------------------- |
|  200   | json  | { success: true, message: "状态已更新" }      |
|  401   | json  | { success: false, message: "未登录或已过期" } |
|  500   | json  | { success: false, message: "服务器错误" }     |

---

## 管理员相关

所有管理员接口均需要 **HttpOnly Cookie: `admin_token`**。

### POST /admin/login

#### 请求参数

|  参数名  |  类型  | 必填  | 描述       |
| :------: | :----: | :---: | :--------- |
| username | string |  是   | 管理员账号 |
| password | string |  是   | 管理员密码 |

#### 返回值

| 状态码 | 类型  | 描述                                                             |
| :----: | :---: | :--------------------------------------------------------------- |
|  200   | json  | { success: true, message: "登录成功" } (设置 admin_token Cookie) |
|  401   | json  | { success: false, message: "账号或密码错误" }                    |

---

### POST /admin/check

#### 说明

检查管理员登录状态。

#### 返回值

| 状态码 | 类型  | 描述                                |
| :----: | :---: | :---------------------------------- |
|  200   | json  | { success: true, message: "有效" }  |
|  401   | json  | { success: false, message: "过期" } |

---

### POST /admin/contest_update

#### 说明

更新比赛设置（管理员权限）。

#### 请求参数

|  参数名   |  类型   | 必填  | 描述        |
| :-------: | :-----: | :---: | :---------- |
| contestId | string  |  是   | 比赛 URL ID |
| startTime | string  |  否   | 开始时间    |
|  endTime  | string  |  否   | 结束时间    |
|   rated   | boolean |  否   | 是否计分    |
|  status   |   int   |  否   | 状态        |

---

### POST /admin/contest_delete

#### 说明

删除比赛及其相关数据（管理员权限）。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述        |
| :-------: | :----: | :---: | :---------- |
| contestId | string |  是   | 比赛 URL ID |

---

### POST /admin/contest_clear

#### 说明

清空所有比赛数据（管理员权限，慎用）。

#### 请求参数

无

---

### POST /admin/room_delete

#### 说明

删除指定房间（管理员权限）。

#### 请求参数

| 参数名  |  类型  | 必填  | 描述     |
| :-----: | :----: | :---: | :------- |
| room_id | string |  是   | 房间 URL |

---

### POST /admin/room_clear

#### 说明

清空所有房间数据（管理员权限，慎用）。

#### 请求参数

无

---

### POST /admin/users

#### 说明

获取所有用户列表（管理员权限）。支持通过用户名或 AtCoder 名进行模糊查询。

#### 请求参数

| 参数名 |  类型  | 必填  | 描述           |
| :----: | :----: | :---: | :------------- |
| query  | string |  否   | 模糊查询字符串 |

---

### POST /admin/user_detail

#### 说明

获取指定用户的详细信息（管理员权限）。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述    |
| :------: | :----: | :---: | :------ |
|  userId  | string |  否   | 用户 ID |
| username | string |  否   | 用户名  |

*(注：userId 和 username 必须提供其中一个)*

---

### POST /admin/ban

#### 说明

封禁用户。

#### 请求参数

|   参数名   |  类型  | 必填  | 描述           |
| :--------: | :----: | :---: | :------------- |
|  username  | string |  是   | 要封禁的用户名 |
|   reason   | string |  否   | 封禁原因       |
| endBanTime | string |  是   | 封禁截止时间   |

---

### POST /admin/unban

#### 说明

解除用户封禁。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述           |
| :------: | :----: | :---: | :------------- |
| username | string |  是   | 要解封的用户名 |

---

### POST /admin/bulletin_add

#### 说明

发布新公告（管理员权限）。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述     |
| :------: | :----: | :---: | :------- |
|  title   | string |  是   | 公告标题 |
| content  | string |  是   | 公告内容 |
| priority |  int   |  否   | 优先级   |

---

### POST /admin/bulletin_update

#### 说明

更新公告（管理员权限）。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述     |
| :------: | :----: | :---: | :------- |
|    id    |  int   |  是   | 公告 ID  |
|  title   | string |  否   | 公告标题 |
| content  | string |  否   | 公告内容 |
| priority |  int   |  否   | 优先级   |

---

### POST /admin/bulletin_delete

#### 说明

删除公告（管理员权限）。

#### 请求参数

| 参数名 | 类型  | 必填  | 描述    |
| :----: | :---: | :---: | :------ |
|   id   |  int  |  是   | 公告 ID |

---

### POST /admin/logs

#### 说明

获取服务器日志。

#### 请求参数

| 参数名 |  类型  | 必填  | 描述            |
| :----: | :----: | :---: | :-------------- |
|  date  | string |  否   | 日期 (默认最新) |
