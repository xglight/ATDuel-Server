import bcrypt from 'bcrypt';
import config from '../config.mjs';
import logger from '../logger.mjs';
import pool from '../db.mjs';

async function handler(ctx, next) {
    const { username, password, token } = ctx.request.body;

    if (!password || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'Password or token is required.' };
        return;
    }

    const loginUsername = username || 'admin';
    logger.debug(`admin: Login attempt for user: ${loginUsername}`);

    try {
        // 从数据库获取管理员信息
        const [rows] = await pool.execute(
            'SELECT password FROM admins WHERE username = ? LIMIT 1',
            [loginUsername]
        );

        if (rows.length === 0) {
            logger.warn(`admin: Admin user not found: ${loginUsername}`);
            ctx.status = 401;
            ctx.body = { success: false, message: 'Incorrect username or password.' };
            return;
        }

        const match = await bcrypt.compare(password, rows[0].password);

        if (match) {
            logger.info(`Admin login successful: ${loginUsername}`);
            try {
                await pool.execute(
                    `INSERT INTO admin_status (token, loginTime) VALUES (?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE loginTime = CURRENT_TIMESTAMP`,
                    [token]
                );
            } catch (err) {
                logger.error(`admin_login: Database operation failed: ${err.message}`);
                ctx.status = 500;
                ctx.body = { success: false, message: 'Database Error' };
                return;
            }
            ctx.status = 200;
            ctx.body = { success: true };
        } else {
            ctx.status = 401;
            ctx.body = { success: false, message: 'Incorrect username or password.' };
        }
    } catch (error) {
        logger.error('admin: Admin login error: ', error);
        ctx.status = 500;
        ctx.body = { success: false, message: 'Internal server error.' };
    }
}

export default {
    'POST /admin/login': handler,
};