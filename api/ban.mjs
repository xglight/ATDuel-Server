import pool from '../db.mjs';
import logger from '../logger.mjs';
import config from '../config.mjs';
async function banUser(ctx, next) {
    const { username, reason, endBanTime, token } = ctx.request.body;
    if (!username || !endBanTime || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'username or endBanTime or token cannot be empty' };
        return;
    }

    const res = await fetch(config.buildApiUrl('/admin/check'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: token }),
    }).then(res => res.json());
    if (res.success == false) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'Token is invalid.' };
        return;
    }

    try {
        logger.info(`banUser: 封禁用户 ${username}，原因: ${reason}，截止时间: ${endBanTime}`);
        await pool.execute('INSERT INTO user_ban (username, reason, endBanTime) VALUES (?, ?, ?)', [username, reason, endBanTime]);
        ctx.status = 200;
        ctx.body = { success: true, message: 'User banned successfully' };
    } catch (err) {
        logger.error(`banUser: 数据库错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: 'Server Error' };
    }
}

export default { 'POST /admin/ban': banUser };