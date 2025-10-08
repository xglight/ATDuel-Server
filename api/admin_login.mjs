import bcrypt from 'bcrypt';
import config from '../config.mjs';
import logger from '../logger.mjs';
import pool from '../db.mjs';

async function handler(ctx, next) {
    const { password, token } = ctx.request.body;

    if (!password || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'Password or token is required.' };
        return;
    }

    logger.debug('admin: 尝试登录');

    try {
        const match = await bcrypt.compare(password, config.adminPassword);

        if (match) {
            logger.info('Admin login successful.');
            try {
                await pool.execute(`INSERT INTO admin_status (token, loginTime) VALUES (?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE loginTime = CURRENT_TIMESTAMP`, [token])
            } catch (err) {
                logger.error(`admin_login: 数据库操作失败: ${err.message}`);
                ctx.status = 500;
                ctx.type = 'text/plain';
                ctx.body = 'Server Error';
                return;
            }
            ctx.status = 200;
            ctx.body = { success: true };
        } else {
            ctx.status = 401;
            ctx.body = { success: false, message: 'Incorrect password.' };
        }
    } catch (error) {
        logger.error('admin: Admin 登录出现错误: ', error);
        ctx.status = 500;
        ctx.body = { success: false, message: 'Internal server error.' };
    }
}

export default {
    'POST /admin/login': handler,
};