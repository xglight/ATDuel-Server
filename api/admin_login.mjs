import bcrypt from 'bcrypt';
import config from '../config.mjs';
import logger from '../logger.mjs';
import pool from '../db.mjs';

/**
 * 管理员登录接口
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function adminLogin(ctx) {
    const { username, password, token } = ctx.request.body;

    if (!password || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: '密码和 Token 不能为空' };
        return;
    }

    const loginUsername = username || 'admin';
    logger.debug(`admin: 尝试登录用户: ${loginUsername}`);

    try {
        // 从数据库获取管理员信息
        const [rows] = await pool.execute(
            'SELECT password FROM admins WHERE username = ? LIMIT 1',
            [loginUsername]
        );

        if (rows.length === 0) {
            logger.warn(`admin: 管理员用户不存在: ${loginUsername}`);
            ctx.status = 401;
            ctx.body = { success: false, message: '用户名或密码错误' };
            return;
        }

        const match = await bcrypt.compare(password, rows[0].password);

        if (match) {
            logger.info(`管理员登录成功: ${loginUsername}`);
            try {
                await pool.execute(
                    `INSERT INTO admin_status (token, loginTime) VALUES (?, CURRENT_TIMESTAMP) 
                     ON DUPLICATE KEY UPDATE loginTime = CURRENT_TIMESTAMP`,
                    [token]
                );
            } catch (err) {
                logger.error(`admin_login: 数据库操作失败: ${err.message}`);
                ctx.status = 500;
                ctx.body = { success: false, message: '数据库错误' };
                return;
            }
            ctx.status = 200;
            ctx.body = { success: true, message: '登录成功' };
        } else {
            logger.warn(`admin: 密码错误: ${loginUsername}`);
            ctx.status = 401;
            ctx.body = { success: false, message: '用户名或密码错误' };
        }
    } catch (error) {
        logger.error(`admin: 管理员登录错误: ${error.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'POST /admin/login': adminLogin,
};