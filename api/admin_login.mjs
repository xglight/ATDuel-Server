import bcrypt from 'bcrypt';
import crypto from 'crypto';
import config from '../config.mjs';
import logger from '../logger.mjs';
import pool from '../db.mjs';

/**
 * 管理员登录接口
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function adminLogin(ctx) {
    const { username, password } = ctx.request.body;

    if (!password) {
        ctx.status = 400;
        ctx.body = { success: false, message: '密码不能为空' };
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

            // 生成服务器端 Token
            const token = crypto.randomBytes(32).toString('hex');

            try {
                // 记录管理员登录状态，支持更新 Token
                // 注意：admin_status 表的字段是 username, token, loginTime
                await pool.execute(
                    `INSERT INTO admin_status (username, token, loginTime) VALUES (?, ?, CURRENT_TIMESTAMP) 
                     ON DUPLICATE KEY UPDATE token = VALUES(token), loginTime = CURRENT_TIMESTAMP`,
                    [loginUsername, token]
                );
            } catch (err) {
                logger.error(`admin_login: 数据库操作失败: ${err.message}`);
                ctx.status = 500;
                ctx.body = { success: false, message: '数据库错误' };
                return;
            }

            // 设置 HttpOnly Cookie
            ctx.cookies.set('admin_token', token, {
                maxAge: 24 * 60 * 60 * 1000,
                httpOnly: true,
                path: '/',
                overwrite: true
            });

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