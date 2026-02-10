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

## 用户相关

### POST /login

#### 请求参数

|   参数名   |  类型  | 必填  | 描述                        |
| :--------: | :----: | :---: | :-------------------------- |
|  username  | string |  是   | 用户名                      |
|  password  | string |  是   | 密码 (Base64 编码)          |
|   token    | string |  是   | 登录用的 token              |
| rememberMe |  int   |  否   | 是否记住登录 (0: 否, 1: 是) |

#### 返回值

| 状态码 | 类型  | 描述                                                         |
| :----: | :---: | :----------------------------------------------------------- |
|  200   | json  | { success: true, message: "登录成功" }                       |
|  400   | json  | { success: false, message: "用户名、密码和 Token 不能为空" } |
|  401   | json  | { success: false, message: "用户名或密码错误" }              |
|  403   | json  | { success: false, message: "您已被封禁至...，原因: ..." }    |
|  500   | json  | { success: false, message: "服务器内部错误" }                |

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

| 状态码 | 类型  | 描述                                          |
| :----: | :---: | :-------------------------------------------- |
|  200   | json  | { success: true, message: "登录有效" }        |
|  400   | json  | { success: false, message: "参数缺失" }       |
|  401   | json  | { success: false, message: "未登录或已过期" } |
|  403   | json  | { success: false, message: "用户被封禁" }     |
|  500   | json  | { success: false, message: "服务器错误" }     |

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

登出用户。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述   |
| :------: | :----: | :---: | :----- |
| username | string |  是   | 用户名 |
|  token   | string |  是   | token  |

#### 返回值

| 状态码 | 类型  | 描述                                          |
| :----: | :---: | :-------------------------------------------- |
|  200   | json  | { success: true, message: "登出成功" }        |
|  400   | json  | { success: false, message: "参数缺失" }       |
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

修改用户密码。验证当前密码并更新为新密码，更新后将强制该用户在所有设备上重新登录。

#### 请求参数

|   参数名    |  类型  | 必填  | 描述                   |
| :---------: | :----: | :---: | :--------------------- |
|  username   | string |  是   | 用户名                 |
|    token    | string |  是   | token                  |
| oldPassword | string |  是   | 当前密码 (Base64 编码) |
| newPassword | string |  是   | 新密码 (Base64 编码)   |

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

开始比赛。从房间配置中生成题目并初始化比赛数据。

#### 请求参数

| 参数名  |  类型  | 必填  |    描述     |
| :-----: | :----: | :---: | :---------: |
| room_id | string |  是   | 房间 URL ID |

#### 返回值

| 状态码 | 类型  | 描述                                                       |
| :----: | :---: | :--------------------------------------------------------- |
|  200   | json  | { success: true, message: "比赛已开始", contestId: "..." } |
|  400   | json  | { success: false, message: "房间 ID 不能为空" }            |
|  404   | json  | { success: false, message: "未找到该房间" }                |
|  500   | json  | { success: false, message: "服务器内部错误" }              |

---

### POST /contest_ac

#### 说明

当用户 AC 题目时，更新比赛分数和题目状态。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述              |
| :-------: | :----: | :---: | :---------------- |
| contestId | string |  是   | 比赛 URL ID       |
| username  | string |  是   | ATDuel 用户名     |
|   title   | string |  是   | 题目名 (包含编号) |

#### 返回值

| 状态码 | 类型  | 描述                                      |
| :----: | :---: | :---------------------------------------- |
|  200   | json  | { success: true, message: "分数已更新" }  |
|  400   | json  | { success: false, message: "参数缺失" }   |
|  500   | json  | { success: false, message: "服务器错误" } |

---

### POST /submission_update

#### 说明

更新比赛中的提交记录。

#### 请求参数

|    参数名    |  类型  | 必填  | 描述           |
| :----------: | :----: | :---: | :------------- |
| problemTitle | string |  是   | 题目名         |
|  contestId   | string |  是   | 比赛 URL ID    |
|   username   | string |  是   | 当前请求用户名 |
|    token     | string |  是   | 用户 token     |

#### 返回值

| 状态码 | 类型  | 描述                                               |
| :----: | :---: | :------------------------------------------------- |
|  200   | json  | { success: true, message: "提交记录已更新" }       |
|  401   | json  | { success: false, message: "未登录或 Token 无效" } |
|  403   | json  | { success: false, message: "非比赛参赛者" }        |
|  404   | json  | { success: false, message: "比赛不存在" }          |
|  500   | json  | { success: false, message: "服务器错误" }          |

---

### POST /contest_final

#### 说明

结束比赛并结算 Rating。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述        |
| :-------: | :----: | :---: | :---------- |
| contestId | string |  是   | 比赛 URL ID |

#### 返回值

| 状态码 | 类型  | 描述                                            |
| :----: | :---: | :---------------------------------------------- |
|  200   | json  | { success: true, message: "结算成功" }          |
|  400   | json  | { success: false, message: "比赛 ID 不能为空" } |
|  404   | json  | { success: false, message: "未找到该比赛" }     |
|  500   | json  | { success: false, message: "服务器错误" }       |

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

在比赛中发起换题请求。需对方在限时内同意。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述         |
| :-------: | :----: | :---: | :----------- |
| contestId | string |  是   | 比赛 URL ID  |
| problemId | string |  是   | 题目 ID      |
| username  | string |  是   | 发起者用户名 |
|   token   | string |  是   | 发起者 token |

#### 返回值

| 状态码 | 类型  | 描述                                               |
| :----: | :---: | :------------------------------------------------- |
|  200   | json  | { success: true, message: "请求发起成功" }         |
|  400   | json  | { success: false, message: "参数无效" }            |
|  401   | json  | { success: false, message: "未登录或 Token 无效" } |
|  500   | json  | { success: false, message: "服务器错误" }          |

---

### POST /respond_change_problem

#### 说明

响应对方发起的换题请求。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述                               |
| :-------: | :----: | :---: | :--------------------------------- |
| contestId | string |  是   | 比赛 URL ID                        |
| requestId | string |  是   | 请求 ID                            |
|  action   | string |  是   | `accept` (接受) 或 `reject` (拒绝) |
| username  | string |  是   | 响应者用户名                       |
|   token   | string |  是   | 响应者 token                       |

#### 返回值

| 状态码 | 类型  | 描述                                               |
| :----: | :---: | :------------------------------------------------- |
|  200   | json  | { success: true, message: "响应处理成功" }         |
|  400   | json  | { success: false, message: "参数无效" }            |
|  401   | json  | { success: false, message: "未登录或 Token 无效" } |
|  500   | json  | { success: false, message: "服务器错误" }          |

---

### POST /contest/request_action

#### 说明

发起平局 (draw) 或认输 (surrender) 请求。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述                                          |
| :-------: | :----: | :---: | :-------------------------------------------- |
| contestId | string |  是   | 比赛 URL ID                                   |
|   type    | string |  是   | 请求类型: `draw` (平局) 或 `surrender` (认输) |
| username  | string |  是   | 发起者用户名                                  |
|   token   | string |  是   | 发起者 token                                  |

#### 返回值

| 状态码 | 类型  | 描述                                               |
| :----: | :---: | :------------------------------------------------- |
|  200   | json  | { success: true, message: "请求发起成功" }         |
|  400   | json  | { success: false, message: "参数无效" }            |
|  401   | json  | { success: false, message: "未登录或 Token 无效" } |
|  500   | json  | { success: false, message: "服务器错误" }          |

---

### POST /contest/vote_action

#### 说明

参与平局或认输请求的投票。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述                                         |
| :-------: | :----: | :---: | :------------------------------------------- |
| contestId | string |  是   | 比赛 URL ID                                  |
| requestId | string |  是   | 请求 ID                                      |
|  action   | string |  是   | 响应动作: `accept` (同意) 或 `reject` (拒绝) |
| username  | string |  是   | 投票者用户名                                 |
|   token   | string |  是   | 投票者 token                                 |

#### 返回值

| 状态码 | 类型  | 描述                                               |
| :----: | :---: | :------------------------------------------------- |
|  200   | json  | { success: true, message: "投票成功" }             |
|  400   | json  | { success: false, message: "参数无效" }            |
|  401   | json  | { success: false, message: "未登录或 Token 无效" } |
|  500   | json  | { success: false, message: "服务器错误" }          |

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

| 状态码 | 类型  | 描述                                            |
| :----: | :---: | :---------------------------------------------- |
|  200   | json  | { success: true, data: {...} }                  |
|  400   | json  | { success: false, message: "房间 ID 不能为空" } |
|  404   | json  | { success: false, message: "未找到该房间" }     |
|  500   | json  | { success: false, message: "服务器内部错误" }   |

---

### POST /room_create

#### 说明

创建房间。

#### 请求参数

|    参数名    |  类型  | 必填  | 描述                   |
| :----------: | :----: | :---: | :--------------------- |
|   username   | string |  是   | 房主用户名             |
|    token     | string |  是   | 房主 token             |
| playerCount  | string |  否   | 模式 (如 `1v1", `2v2`) |
|   isRated    |  bool  |  否   | 是否 Rated             |
|  ratingMin   |  int   |  否   | 难度下限               |
|  ratingMax   |  int   |  否   | 难度上限               |
| problemCount |  int   |  否   | 题目数量               |

#### 返回值

| 状态码 | 类型  | 描述                                                      |
| :----: | :---: | :-------------------------------------------------------- |
|  200   | json  | { success: true, message: "房间创建成功", roomId: "..." } |
|  400   | json  | { success: false, message: "参数缺失" }                   |
|  401   | json  | { success: false, message: "未登录或 Token 无效" }        |
|  500   | json  | { success: false, message: "服务器内部错误" }             |

---

### POST /room_delete

#### 说明

删除房间。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述        |
| :------: | :----: | :---: | :---------- |
| room_id  | string |  是   | 房间 URL ID |
| username | string |  是   | 房主用户名  |
|  token   | string |  是   | 房主 token  |

#### 返回值

| 状态码 | 类型  | 描述                                            |
| :----: | :---: | :---------------------------------------------- |
|  200   | json  | { success: true, message: "房间已删除" }        |
|  400   | json  | { success: false, message: "参数缺失" }         |
|  401   | json  | { success: false, message: "未登录或权限不足" } |
|  404   | json  | { success: false, message: "房间不存在" }       |
|  500   | json  | { success: false, message: "服务器错误" }       |

---

### POST /room_ready

#### 说明

更新房间内用户的准备状态。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述              |
| :------: | :----: | :---: | :---------------- |
| room_id  | string |  是   | 房间 URL ID       |
|   team   | string |  是   | 队伍 (`A` 或 `B`) |
| position |  int   |  是   | 队伍内位置        |
|  ready   |  bool  |  是   | 是否准备          |
| username | string |  是   | 用户名            |
|  token   | string |  是   | token             |

#### 返回值

| 状态码 | 类型  | 描述                                               |
| :----: | :---: | :------------------------------------------------- |
|  200   | json  | { success: true, message: "状态已更新" }           |
|  400   | json  | { success: false, message: "参数缺失" }            |
|  401   | json  | { success: false, message: "未登录或 Token 无效" } |
|  500   | json  | { success: false, message: "服务器错误" }          |

---

### POST /room_user_update

#### 说明

更新房间内的用户信息 (加入或退出房间/队伍)。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述                    |
| :------: | :----: | :---: | :---------------------- |
|  roomId  | string |  是   | 房间 URL ID             |
|    op    |  int   |  是   | 操作 (0: 退出, 1: 加入) |
|   team   |  int   |  是   | 队伍 (1: A, 2: B)       |
| username | string |  是   | 用户名                  |
|  token   | string |  是   | token                   |
|   pos    |  int   |  否   | 位置 (仅加入时有效)     |

#### 返回值

| 状态码 | 类型  | 描述                                               |
| :----: | :---: | :------------------------------------------------- |
|  200   | json  | { success: true, message: "操作成功" }             |
|  400   | json  | { success: false, message: "参数无效" }            |
|  401   | json  | { success: false, message: "未登录或 Token 无效" } |
|  403   | json  | { success: false, message: "房间已满或无法加入" }  |
|  500   | json  | { success: false, message: "服务器错误" }          |

---

## Atcoder 相关

### GET /atavatar/:username

#### 说明

直接从 AtCoder 抓取用户的头像 URL。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述           | 位置  |
| :------: | :----: | :---: | :------------- | :---: |
| username | string |  是   | AtCoder 用户名 | path  |

#### 返回值

| 状态码 | 类型  | 描述                                          |
| :----: | :---: | :-------------------------------------------- |
|  200   | json  | { success: true, data: "头像 URL" }           |
|  400   | json  | { success: false, message: "用户名不能为空" } |
|  404   | json  | { success: false, message: "未找到头像" }     |
|  500   | json  | { success: false, message: "服务器错误" }     |

---

### GET /atRating/:username

#### 说明

直接从 AtCoder 抓取用户的当前 Rating。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述           | 位置  |
| :------: | :----: | :---: | :------------- | :---: |
| username | string |  是   | AtCoder 用户名 | path  |

#### 返回值

| 状态码 | 类型  | 描述                                                 |
| :----: | :---: | :--------------------------------------------------- |
|  200   | json  | { success: true, data: 1200 }                        |
|  400   | json  | { success: false, message: "用户名不能为空" }        |
|  404   | json  | { success: false, message: "未找到该用户的 Rating" } |
|  500   | json  | { success: false, message: "服务器错误" }            |

---

### POST /user_submissions

#### 说明

获取 AtCoder 用户的提交记录。

#### 请求参数

|   参数名   |  类型  | 必填  | 描述           |
| :--------: | :----: | :---: | :------------- |
|  username  | string |  是   | AtCoder 用户名 |
| problem_id | string |  是   | 题目 ID        |
| startTime  | string |  是   | 比赛开始时间   |
|  contest   | string |  否   | 题目所属比赛名 |

#### 返回值

| 状态码 | 类型  | 描述                                          |
| :----: | :---: | :-------------------------------------------- |
|  200   | json  | { success: true, data: [...] }                |
|  400   | json  | { success: false, message: "参数无效" }       |
|  500   | json  | { success: false, message: "服务器内部错误" } |

---

## 公告相关

### GET /bulletins

#### 说明

获取所有公告列表。

#### 返回值

| 状态码 | 类型  | 描述                                          |
| :----: | :---: | :-------------------------------------------- |
|  200   | json  | { success: true, data: [...] }                |
|  500   | json  | { success: false, message: "服务器内部错误" } |

---

## 管理员相关

### POST /admin/login

#### 说明

管理员登录。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述                        |
| :------: | :----: | :---: | :-------------------------- |
| username | string |  否   | 管理员用户名 (默认 `admin`) |
| password | string |  是   | 密码 (Base64 编码)          |
|  token   | string |  是   | 登录 token                  |

#### 返回值

| 状态码 | 类型  | 描述                                            |
| :----: | :---: | :---------------------------------------------- |
|  200   | json  | { success: true, message: "登录成功" }          |
|  400   | json  | { success: false, message: "参数缺失" }         |
|  401   | json  | { success: false, message: "用户名或密码错误" } |
|  500   | json  | { success: false, message: "服务器内部错误" }   |

---

### POST /admin/check

#### 说明

检查管理员登录状态。

#### 请求参数

| 参数名 |  类型  | 必填  | 描述         |
| :----: | :----: | :---: | :----------- |
| token  | string |  是   | 管理员 token |

#### 返回值

| 状态码 | 类型  | 描述                                          |
| :----: | :---: | :-------------------------------------------- |
|  200   | json  | { success: true, message: "登录状态有效" }    |
|  400   | json  | { success: false, message: "Token 不能为空" } |
|  401   | json  | { success: false, message: "管理员未登录" }   |
|  500   | json  | { success: false, message: "服务器错误" }     |

---

### POST /admin/users

#### 说明

获取所有注册用户信息 (需管理员权限)。

#### 请求参数

| 参数名 |  类型  | 必填  | 描述           |
| :----: | :----: | :---: | :------------- |
| token  | string |  是   | 管理员 token   |
| query  | string |  否   | 搜索过滤字符串 |

#### 返回值

| 状态码 | 类型  | 描述                                        |
| :----: | :---: | :------------------------------------------ |
|  200   | json  | { success: true, data: [...] }              |
|  401   | json  | { success: false, message: "管理员未登录" } |
|  403   | json  | { success: false, message: "未授权" }       |
|  500   | json  | { success: false, message: "服务器错误" }   |

---

### POST /admin/ban

#### 说明

封禁用户 (需管理员权限)。

#### 请求参数

|   参数名   |  类型  | 必填  | 描述         |
| :--------: | :----: | :---: | :----------- |
|  username  | string |  是   | 用户名       |
|   token    | string |  是   | 管理员 token |
|   reason   | string |  否   | 封禁原因     |
| endBanTime | string |  是   | 封禁截止时间 |

#### 返回值

| 状态码 | 类型  | 描述                                        |
| :----: | :---: | :------------------------------------------ |
|  200   | json  | { success: true, message: "封禁成功" }      |
|  400   | json  | { success: false, message: "参数缺失" }     |
|  401   | json  | { success: false, message: "权限校验失败" } |
|  500   | json  | { success: false, message: "服务器错误" }   |

---

### POST /admin/unban

#### 说明

解封用户 (需管理员权限)。

#### 请求参数

|  参数名  |  类型  | 必填  | 描述         |
| :------: | :----: | :---: | :----------- |
| username | string |  是   | 用户名       |
|  token   | string |  是   | 管理员 token |

#### 返回值

| 状态码 | 类型  | 描述                                        |
| :----: | :---: | :------------------------------------------ |
|  200   | json  | { success: true, message: "解封成功" }      |
|  400   | json  | { success: false, message: "参数缺失" }     |
|  401   | json  | { success: false, message: "权限校验失败" } |
|  500   | json  | { success: false, message: "服务器错误" }   |

---

### POST /admin/logs

#### 说明

获取服务器日志 (需管理员权限)。

#### 请求参数

| 参数名 |  类型  | 必填  | 描述                                           |
| :----: | :----: | :---: | :--------------------------------------------- |
| token  | string |  是   | 管理员 token                                   |
|  date  | string |  否   | 指定日期 (如 `2024-01-01`), 不传则返回最新日志 |

#### 返回值

| 状态码 | 类型  | 描述                                          |
| :----: | :---: | :-------------------------------------------- |
|  200   | json  | { success: true, data: "日志内容" }           |
|  400   | json  | { success: false, message: "Token 不能为空" } |
|  401   | json  | { success: false, message: "权限校验失败" }   |
|  500   | json  | { success: false, message: "服务器错误" }     |

---

### POST /admin/contest_delete

#### 说明

管理员删除指定比赛。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述         |
| :-------: | :----: | :---: | :----------- |
| contestId | string |  是   | 比赛 URL ID  |
|   token   | string |  是   | 管理员 token |

#### 返回值

| 状态码 | 类型  | 描述                                              |
| :----: | :---: | :------------------------------------------------ |
|  200   | json  | { success: true, message: "比赛已删除" }          |
|  400   | json  | { success: false, message: "参数缺失" }           |
|  401   | json  | { success: false, message: "管理员权限校验失败" } |
|  404   | json  | { success: false, message: "比赛不存在" }         |
|  500   | json  | { success: false, message: "服务器内部错误" }     |

---

### POST /admin/contest_update

#### 说明

管理员更新比赛信息。

#### 请求参数

|  参数名   |  类型  | 必填  | 描述                                   |
| :-------: | :----: | :---: | :------------------------------------- |
| contestId | string |  是   | 比赛 URL ID                            |
|   token   | string |  是   | 管理员 token                           |
| startTime | string |  否   | 开始时间 (ISO 格式)                    |
|  endTime  | string |  否   | 结束时间 (ISO 格式)                    |
|   rated   |  bool  |  否   | 是否 Rated                             |
|  status   |  int   |  否   | 状态 (0: 未开始, 1: 进行中, 2: 已结束) |

#### 返回值

| 状态码 | 类型  | 描述                                              |
| :----: | :---: | :------------------------------------------------ |
|  200   | json  | { success: true, message: "比赛信息已更新" }      |
|  400   | json  | { success: false, message: "参数缺失" }           |
|  401   | json  | { success: false, message: "管理员权限校验失败" } |
|  404   | json  | { success: false, message: "比赛不存在" }         |
|  500   | json  | { success: false, message: "服务器内部错误" }     |

---

### POST /admin/room_delete

#### 说明

管理员删除房间。

#### 请求参数

| 参数名 |  类型  | 必填  | 描述              |
| :----: | :----: | :---: | :---------------- |
| roomId | string |  是   | 房间 ID 或 URL ID |
| token  | string |  是   | 管理员 token      |

#### 返回值

| 状态码 | 类型  | 描述                                              |
| :----: | :---: | :------------------------------------------------ |
|  200   | json  | { success: true, message: "房间已关闭" }          |
|  400   | json  | { success: false, message: "参数缺失" }           |
|  401   | json  | { success: false, message: "管理员权限校验失败" } |
|  404   | json  | { success: false, message: "房间不存在" }         |
|  500   | json  | { success: false, message: "服务器内部错误" }     |

---

### POST /admin/contest_clear

#### 说明

管理员清空所有已结束的比赛及其关联数据。

#### 请求参数

| 参数名 |  类型  | 必填  | 描述         |
| :----: | :----: | :---: | :----------- |
| token  | string |  是   | 管理员 token |

#### 返回值

| 状态码 | 类型  | 描述                                                    |
| :----: | :---: | :------------------------------------------------------ |
|  200   | json  | { success: true, message: "已清理 ... 个已结束的比赛" } |
|  401   | json  | { success: false, message: "管理员权限校验失败" }       |
|  500   | json  | { success: false, message: "服务器内部错误" }           |

---

### POST /admin/room_clear

#### 说明

管理员清空所有空房间。

#### 请求参数

| 参数名 |  类型  | 必填  | 描述         |
| :----: | :----: | :---: | :----------- |
| token  | string |  是   | 管理员 token |

#### 返回值

| 状态码 | 类型  | 描述                                              |
| :----: | :---: | :------------------------------------------------ |
|  200   | json  | { success: true, message: "已清理 ... 个空房间" } |
|  401   | json  | { success: false, message: "管理员权限校验失败" } |
|  500   | json  | { success: false, message: "服务器内部错误" }     |

---

### POST /admin/bulletin_add

#### 说明

管理员发布新公告。

#### 请求参数

| 参数名  |  类型  | 必填  | 描述                                     |
| :-----: | :----: | :---: | :--------------------------------------- |
|  token  | string |  是   | 管理员 token                             |
|  title  | string |  是   | 公告标题                                 |
| content | string |  是   | 公告内容                                 |
|  date   | string |  否   | 发布日期 (ISO 格式, 如 `2024-01-01T12:00`) |

#### 返回值

| 状态码 | 类型  | 描述                                                         |
| :----: | :---: | :----------------------------------------------------------- |
|  200   | json  | { success: true, message: "公告已发布" }                     |
|  400   | json  | { success: false, message: "标题、内容和 Token 均不能为空" } |
|  401   | json  | { success: false, message: "管理员权限校验失败" }            |
|  500   | json  | { success: false, message: "服务器内部错误" }                |

---

### POST /admin/bulletin_update

#### 说明

管理员更新现有公告。

#### 请求参数

| 参数名  |  类型  | 必填  | 描述                                     |
| :-----: | :----: | :---: | :--------------------------------------- |
|  token  | string |  是   | 管理员 token                             |
|   id    |  int   |  是   | 公告 ID                                  |
|  title  | string |  是   | 公告标题                                 |
| content | string |  是   | 公告内容                                 |
|  date   | string |  否   | 发布日期 (ISO 格式, 如 `2024-01-01T12:00`) |

#### 返回值

| 状态码 | 类型  | 描述                                                  |
| :----: | :---: | :---------------------------------------------------- |
|  200   | json  | { success: true, message: "公告已更新" }              |
|  400   | json  | { success: false, message: "ID 和 Token 均不能为空" } |
|  401   | json  | { success: false, message: "管理员权限校验失败" }     |
|  500   | json  | { success: false, message: "服务器内部错误" }         |

---

### POST /admin/bulletin_delete

#### 说明

管理员删除指定公告。

#### 请求参数

| 参数名 |  类型  | 必填  | 描述         |
| :----: | :----: | :---: | :----------- |
| token  | string |  是   | 管理员 token |
|   id   |  int   |  是   | 公告 ID      |

#### 返回值

| 状态码 | 类型  | 描述                                                  |
| :----: | :---: | :---------------------------------------------------- |
|  200   | json  | { success: true, message: "公告已删除" }              |
|  400   | json  | { success: false, message: "ID 和 Token 均不能为空" } |
|  401   | json  | { success: false, message: "管理员权限校验失败" }     |
|  404   | json  | { success: false, message: "公告不存在" }             |
|  500   | json  | { success: false, message: "服务器内部错误" }         |

---

## 系统相关

### GET /config

#### 说明

获取前端所需的公开配置信息 (如注册限制、题目限制等)。

#### 返回值

| 状态码 | 类型  | 描述                                                                        |
| :----: | :---: | :-------------------------------------------------------------------------- |
|  200   | json  | { success: true, data: { register: {...}, content: {...}, server: {...} } } |

---

### GET /health

#### 说明

检查服务健康状态，返回系统运行时间及用户、比赛、房间数量。

#### 返回值

| 状态码 | 类型  | 描述                                                                                                                        |
| :----: | :---: | :-------------------------------------------------------------------------------------------------------------------------- |
|  200   | json  | { success: true, data: { status: "ok", uptime: ..., timestamp: "...", userCount: ..., contestCount: ..., roomCount: ... } } |
|  500   | json  | { success: false, message: "服务器内部错误" }                                                                               |
