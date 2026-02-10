// avatar.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 获取用户头像路径接口
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function getAvatar(ctx) {
    const { username } = ctx.params;
    if (!username) {
        ctx.status = 400;
        ctx.body = { success: false, message: '用户名不能为空' };
        return;
    }

    logger.debug(`avatar: 正在获取用户 ${username} 的头像路径`);

    try {
        const [rows] = await pool.execute('SELECT avatar FROM user WHERE username = ?', [username]);

        if (rows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '未找到该用户' };
            return;
        }

        const avatarPath = rows[0].avatar;
        ctx.status = 200;
        ctx.body = { success: true, data: avatarPath || '' };
    } catch (err) {
        logger.error(`avatar 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default { 'GET /avatar/:username': getAvatar };