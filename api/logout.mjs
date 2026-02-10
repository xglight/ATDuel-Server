// logout.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 用户登出接口
 * 清除用户的登录状态记录
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function logout(ctx) {
    const { username, token } = ctx.request.body;

    if (!username || !token) {
        ctx.status = 400;
        ctx.body = {
            success: false,
            message: '用户名和 Token 不能为空'
        };
        return;
    }

    logger.debug(`logout: 用户 ${username} 正在尝试登出`);

    try {
        const [result] = await pool.execute(
            'DELETE FROM login_status WHERE username = ? AND token = ?',
            [username, token]
        );

        // 即使没有找到匹配的 session，也认为登出成功（幂等性）
        logger.info(`logout: 用户 ${username} 已登出 (影响行数: ${result.affectedRows})`);

        ctx.status = 200;
        ctx.body = {
            success: true,
            message: '登出成功'
        };
    } catch (err) {
        logger.error(`logout 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = {
            success: false,
            message: '服务器内部错误'
        };
    }
}

export default {
    'POST /logout': logout
};
