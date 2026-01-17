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
    logger.info(`user_contestid: Fetching contest IDs for user ${username}`);
    try {
        const [rows] = await pool.query('SELECT contest_id FROM user_contest_history WHERE username = ?', [username]);

        const user_contest = rows.map(r => r.contest_id);
        ctx.type = 'text/json';
        ctx.status = 200;
        ctx.body = { user_contest };
    } catch (err) {
        logger.error(`user_contestid: Failed to fetch contest IDs for user ${username}: ${err.message}`);
        ctx.status = 500;
        ctx.type = 'text/plain';
        ctx.body = 'Server Error';
        return;
    }
}

export default { 'GET /user_contestid/:username': user_contestid };