// atName.mjs

import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 根据 ATDuel 用户名获取 AtCoder 用户名接口
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function atname(ctx) {
    const { username } = ctx.params;

    if (!username) {
        ctx.status = 400;
        ctx.body = { success: false, message: '用户名不能为空' };
        return;
    }

    logger.debug(`atname: 正在获取用户 ${username} 的 AtCoder 用户名`);

    try {
        const [users] = await pool.execute('SELECT ATName FROM user WHERE username = ?', [username]);

        if (users.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '未找到该用户' };
            return;
        }

        const { ATName } = users[0];
        logger.debug(`atname: 找到用户 ${username} 对应的 AtCoder 用户名: ${ATName}`);

        ctx.status = 200;
        ctx.body = { success: true, data: ATName };
    } catch (err) {
        logger.error(`atname 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'GET /atname/:username': atname
}
