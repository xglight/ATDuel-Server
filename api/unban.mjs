import pool from '../db.mjs';
import logger from '../logger.mjs';
import { verifyAdmin } from '../utils/auth.mjs';

/**
 * 解除封禁接口
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function unbanUser(ctx) {
    const { username } = ctx.request.body;
    if (!username) {
        ctx.status = 400;
        ctx.body = { success: false, message: '用户名不能为空' };
        return;
    }

    if (!(await verifyAdmin(ctx))) {
        ctx.status = 401;
        ctx.body = { success: false, message: '管理员权限校验失败' };
        return;
    }

    try {
        logger.info(`unbanUser: 正在解除用户封禁: ${username}`);
        await pool.execute('DELETE FROM user_ban WHERE username = ?', [username]);
        ctx.status = 200;
        ctx.body = { success: true, message: '用户已成功解除封禁' };
    } catch (err) {
        logger.error(`unbanUser 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default { 'POST /admin/unban': unbanUser };