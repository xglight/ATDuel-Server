import pool from '../db.mjs';
import logger from '../logger.mjs';
import config from '../config.mjs';
async function unbanUser(ctx, next) {
    const { username, token } = ctx.request.body;
    if (!username || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'username or token cannot be empty' };
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
    logger.info(`unbanUser: 取消封禁用户 ${username}`);

    try {
        await pool.execute('DELETE FROM user_ban WHERE username = ?', [username]);
        ctx.status = 200;
        ctx.body = { success: true, message: 'User unbanned successfully' };
    } catch (err) {
        logger.error(`unbanUser: 数据库错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: 'Server Error' };
    }
}

export default { 'POST /admin/unban': unbanUser };