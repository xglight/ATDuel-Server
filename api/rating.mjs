// rating.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 获取用户的 Rating 接口
 *
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function rating(ctx) {
    const { username } = ctx.params;
    if (!username) {
        ctx.status = 400;
        ctx.body = { success: false, message: '用户名不能为空' };
        return;
    }

    logger.debug(`rating: 正在查询用户 ${username} 的 Rating`);
    try {
        const [rows] = await pool.execute('SELECT rating FROM user WHERE username = ? LIMIT 1', [username]);

        if (rows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '未找到该用户' };
            return;
        }

        ctx.status = 200;
        ctx.body = { success: true, data: rows[0].rating };
    } catch (err) {
        logger.error(`rating: 查询用户 ${username} 的 Rating 失败: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default { 'GET /rating/:username': rating };