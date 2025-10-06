// check_login.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

async function check_login(ctx, next) {
    const { username, token } = ctx.request.body;

    if (!username || !token) {
        ctx.body = { success: false, message: 'username or token can not be empty' };
        return;
    }
    logger.debug('check_login: 请求检查登录: ', username, token);

    try {
        const [rows] = await pool.execute(
            'SELECT loginTime FROM login_status WHERE username = ? AND token = ? LIMIT 1',
            [username, token]
        );

        if (rows.length === 0) {
            logger.debug('check_login: 用户 ', username, ' 未登录');
            ctx.status = 401;
            ctx.body = { success: false, message: 'user not login' };
            return;
        }

        const loginTime = new Date(rows[0].loginTime);
        const now = Date.now();
        const rememberMe = rows[0].rememberMe || 0;
        const expireTime = rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

        if (now - loginTime.getTime() < expireTime) {
            await pool.execute(
                'UPDATE login_status SET loginTime = CURRENT_TIMESTAMP WHERE username = ? AND token = ?',
                [username, token]
            );
            ctx.body = { success: true, message: 'login success' };
        } else {
            await pool.execute(
                'DELETE FROM login_status WHERE username = ? AND token = ?',
                [username, token]
            );
            logger.debug('check_login: 用户 ', username, ' 登录过期');
            ctx.status = 401;
            ctx.body = { success: false, message: 'login expired' };
        }
    } catch (error) {
        logger.error('check_login: 查询出错: ', error);
        ctx.status = 500;
        ctx.type = 'text/json';
        ctx.body = { success: false, message: 'Server Error' };
    }
}

export default {
    'POST /check_login': check_login
};
