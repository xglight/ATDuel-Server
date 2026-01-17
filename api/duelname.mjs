// duelname.mjs

import pool from '../db.mjs';
import logger from '../logger.mjs';


async function duelname(ctx, next) {
    const username = ctx.params.username;

    if (!username) {
        ctx.status = 400;
        ctx.body = { message: 'Username is required' };
        return;
    }

    logger.debug(`duelname: Querying username: ${username}`);

    try {
        const [result] = await pool.query('SELECT * FROM user WHERE ATName = ?', [username]);
        if (result.length == 0) {
            ctx.status = 404;
            ctx.body = { message: 'User not found' };
        } else {
            ctx.status = 200;
            ctx.type = 'text/plain';
            ctx.body = result[0].username;
        }
    } catch (err) {
        logger.error(`duelname: Failed to query username: ${err.message}`);
        ctx.status = 500;
        ctx.body = { message: 'Internal server error' };
    }
}

export default {
    'GET /duelname/:username': duelname
}
