// check_login.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

async function check_login(ctx, next) {
    const { token } = ctx.request.body;

    if (!token) {
        ctx.body = { success: false, message: 'token can not be empty' };
        return;
    }
    logger.debug('admin_check: 请求检查登录: ', token);

    try {
        const [rows] = await pool.execute(
            'SELECT loginTime FROM admin_status WHERE token = ? LIMIT 1',
            [token]
        );

        if (rows.length === 0) {
            ctx.status = 401;
            ctx.body = { success: false, message: 'user not login' };
            return;
        }

        const loginTime = new Date(rows[0].loginTime);
        const now = Date.now();
        const expireTime = 24 * 60 * 60 * 1000;

        if (now - loginTime.getTime() < expireTime) {
            await pool.execute(
                'UPDATE admin_status SET loginTime = CURRENT_TIMESTAMP WHERE token = ?',
                [token]
            );
            ctx.body = { success: true, message: 'login success' };
        } else {
            await pool.execute(
                'DELETE FROM admin_status WHERE token = ?',
                [token]
            );
            logger.debug('admin_check: 登录过期');
            ctx.status = 401;
            ctx.body = { success: false, message: 'login expired' };
        }
    } catch (error) {
        logger.error('admin_check: 查询出错: ', error);
        ctx.status = 500;
        ctx.type = 'text/json';
        ctx.body = { success: false, message: 'Server Error' };
    }
}

export default {
    'POST /admin/check': check_login
};
