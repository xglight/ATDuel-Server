// rating.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

async function rating(ctx, next) {
    const username = ctx.params.username;
    if (!username) {
        ctx.status = 400;
        ctx.body = { error: 'username is required' };
        return;
    }

    logger.debug(`rating: 查询用户 ${username} 的 rating`);
    try {
        const [rows, fields] = await pool.query('SELECT * FROM user WHERE username = ?', [username]);

        if (rows.length === 0) {
            ctx.status = 404;
            ctx.body = { error: '用户不存在' };
            return;
        }

        const rating = rows[0].rating;

        ctx.status = 200;
        ctx.type = "text/plain"
        ctx.body = rating;
    } catch (err) {
        logger.error(`rating: 查询用户 ${username} 的 rating 失败: ${err.message}`);
        ctx.status = 500;
        ctx.type = "text/plain"
        ctx.body = 'Server Error';
        return;
    }
}

export default { 'GET /rating/:username': rating };