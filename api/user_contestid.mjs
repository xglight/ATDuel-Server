// user_contestid.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 获取用户参与的所有比赛 ID 接口
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function user_contestid(ctx) {
    const { username } = ctx.params;
    if (!username) {
        ctx.status = 400;
        ctx.body = { success: false, message: '用户名不能为空' };
        return;
    }

    logger.debug(`user_contestid: 正在获取用户 ${username} 参与的比赛 ID`);
    try {
        const [rows] = await pool.query('SELECT contest_id FROM contest_participants WHERE username = ?', [username]);

        const user_contest = rows.map(r => r.contest_id);
        ctx.status = 200;
        ctx.body = { success: true, data: user_contest };
    } catch (err) {
        logger.error(`user_contestid: 获取用户 ${username} 参与的比赛 ID 失败: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default { 'GET /user_contestid/:username': user_contestid };