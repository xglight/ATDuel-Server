import pool from '../db.mjs';
import logger from '../logger.mjs';

export async function updateUserAC(username) {
    const [rows] = await pool.query(
        'SELECT acLastUpdate FROM user WHERE username = ?', [username]);

    if (rows.length === 0) {
        return { error: 'user not found' };
    }

    const now = Math.floor(new Date().getTime() / 1000);
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
                logger.error(`updateUserAC: API returned status ${response.status} for user ${username}`);
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
                    const name = item.problem_id;
                    try {
                        await pool.execute(
                            'INSERT IGNORE INTO user_problem_accept (username, problem_id) VALUES (?,?)'
                            , [username, name]);
                    } catch (error) {
                        logger.error('Failed to insert data:', error);
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
            logger.error(`updateUserAC: Failed to fetch submissions for user ${username}: ${err.message}`);
            return { error: 'fetch failed' };
        }
    }

    await pool.execute(
        'UPDATE user SET acLastUpdate = ? WHERE username = ?'
        , [lastUpdate, username]);
    return { success: true };
}

async function user_ac_update(ctx, next) {
    const username = ctx.request.body.username;

    if (!username) {
        ctx.response.status = 400;
        ctx.response.body = { error: 'username is required' };
        return;
    }

    const result = await updateUserAC(username);
    if (result.error) {
        ctx.response.status = result.error === 'user not found' ? 404 : 500;
        ctx.response.body = { error: result.error };
        return;
    }

    ctx.status = 200;
    ctx.type = 'application/json';
    ctx.body = [];
    return;
}

export default { 'POST /user_ac_update': user_ac_update };
