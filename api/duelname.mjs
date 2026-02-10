// duelname.mjs

import pool from '../db.mjs';
import logger from '../logger.mjs';


/**
 * 根据 AtCoder 用户名获取 ATDuel 用户名接口
 *
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function duelname(ctx) {
    const { username } = ctx.params;

    if (!username) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'AtCoder 用户名不能为空' };
        return;
    }

    logger.debug(`duelname: 正在查询 AtCoder 用户 ${username} 对应的 ATDuel 用户名`);

    try {
        const [users] = await pool.execute('SELECT username FROM user WHERE ATName = ?', [username]);

        if (users.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '未找到该用户' };
            return;
        }

        const duelUsername = users[0].username;
        logger.info(`duelname: 找到 AtCoder 用户 ${username} 对应的 ATDuel 用户名: ${duelUsername}`);

        ctx.status = 200;
        ctx.body = { success: true, data: duelUsername };
    } catch (err) {
        logger.error(`duelname: 查询 AtCoder 用户 ${username} 对应的 ATDuel 用户名失败: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'GET /duelname/:username': duelname
}
