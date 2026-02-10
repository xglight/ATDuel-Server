import pool from '../db.mjs';
import logger from '../logger.mjs';
import { verifyAdmin } from '../utils/auth.mjs';

/**
 * 封禁用户接口
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function banUser(ctx) {
    const { username, reason, endBanTime, token } = ctx.request.body;
    if (!username || !endBanTime || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: '用户名、封禁截止时间和 Token 均不能为空' };
        return;
    }

    if (!(await verifyAdmin(token))) {
        ctx.status = 401;
        ctx.body = { success: false, message: '管理员权限校验失败' };
        return;
    }

    try {
        logger.info(`banUser: 正在封禁用户 ${username}, 原因: ${reason}, 截止时间: ${endBanTime}`);
        await pool.execute(
            'INSERT INTO user_ban (username, reason, endBanTime) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE reason = ?, endBanTime = ?',
            [username, reason, endBanTime, reason, endBanTime]
        );
        ctx.status = 200;
        ctx.body = { success: true, message: '用户已成功封禁' };
    } catch (err) {
        logger.error(`banUser 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default { 'POST /admin/ban': banUser };