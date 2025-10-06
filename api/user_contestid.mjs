// user_contest.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

async function user_contestid(ctx, next) {
    const username = ctx.params.username;
    if (!username) {
        ctx.status = 400;
        ctx.body = { error: 'username is required' };
        return;
    }
    logger.info(`user_contestid: 获取用户 ${username} 的比赛 ID`);
    try {
        const [rows, fields] = await pool.query('SELECT * FROM user WHERE username = ?', [username]);

        if (rows.length === 0) {
            ctx.status = 404;
            ctx.body = { error: 'user not found' };
            return;
        }

        const user_contest = rows[0].contest;
        ctx.type = 'text/json';
        ctx.status = 200;
        ctx.body = { user_contest };
    } catch (err) {
        logger.error(`user_contestid: 获取用户 ${username} 的比赛 ID 失败: ${err.message}`);
        ctx.status = 500;
        ctx.type = 'text/plain';
        ctx.body = 'Server Error';
        return;
    }
}

export default { 'GET /user_contestid/:username': user_contestid };