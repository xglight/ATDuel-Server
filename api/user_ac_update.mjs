import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 更新用户在 AtCoder 上的 AC 记录
 * 
 * @param {string} username - 用户名
 * @returns {Promise<{success?: boolean, error?: string}>} 更新结果
 */
export async function updateUserAC(username) {
    const [rows] = await pool.query(
        'SELECT acLastUpdate FROM user WHERE username = ?', [username]);

    if (rows.length === 0) {
        return { error: '未找到该用户' };
    }

    const baseUrl = 'https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=' + username + '&from_second=';

    let lastUpdate = rows[0].acLastUpdate || 0;
    let url = baseUrl + lastUpdate;
    let iterations = 0;
    const MAX_ITERATIONS = 100; // 安全阈值，防止 API 异常导致的无限循环

    while (iterations < MAX_ITERATIONS) {
        iterations++;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                logger.error(`updateUserAC: 用户 ${username} 的 API 请求返回状态码 ${response.status}`);
                break;
            }
            const data = await response.json();

            // 确保 data 是数组且不为空
            if (!Array.isArray(data) || data.length === 0) {
                break;
            }

            let newLastUpdate = lastUpdate;
            for (const item of data) {
                const ts = parseInt(item.epoch_second);
                if (!isNaN(ts)) {
                    newLastUpdate = Math.max(newLastUpdate, ts);
                }

                if (item.result === 'AC') {
                    const problemId = item.problem_id;
                    try {
                        await pool.execute(
                            'INSERT IGNORE INTO user_problem_accept (username, problem_id) VALUES (?,?)'
                            , [username, problemId]);
                    } catch (error) {
                        logger.error(`updateUserAC: 插入 AC 记录失败 (用户: ${username}, 题目: ${problemId}):`, error);
                    }
                }
            }

            // 如果时间戳没有推进，说明可能卡在同一秒的大量提交中，强制推进 1 秒
            if (newLastUpdate === lastUpdate) {
                lastUpdate++;
            } else {
                lastUpdate = newLastUpdate;
            }

            url = baseUrl + lastUpdate;
        } catch (err) {
            logger.error(`updateUserAC: 获取用户 ${username} 的提交记录失败: ${err.message}`);
            return { error: '获取数据失败' };
        }
    }

    await pool.execute(
        'UPDATE user SET acLastUpdate = ? WHERE username = ?'
        , [lastUpdate, username]);
    return { success: true };
}

/**
 * 更新用户 AC 记录接口
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function user_ac_update(ctx) {
    const { username } = ctx.request.body;

    if (!username) {
        ctx.status = 400;
        ctx.body = { success: false, message: '用户名不能为空' };
        return;
    }

    const result = await updateUserAC(username);
    if (result.error) {
        ctx.status = result.error === '未找到该用户' ? 404 : 500;
        ctx.body = { success: false, message: result.error };
        return;
    }

    ctx.status = 200;
    ctx.body = { success: true, message: 'AC 记录更新成功' };
}

export default { 'POST /user_ac_update': user_ac_update };
