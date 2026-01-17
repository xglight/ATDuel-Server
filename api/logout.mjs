// logout.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

async function logout(ctx, next) {
    const { username, token } = ctx.request.body;

    if (!username || !token) {
        ctx.status = 400;
        ctx.body = {
            message: 'Username or token cannot be empty'
        };
        return;
    }

    logger.debug(`logout: User ${username} logged out`);

    try {
        const [rows] = await pool.execute('DELETE FROM login_status WHERE username=? AND token=?', [username, token]);
        if (rows.affectedRows === 0) {
            ctx.status = 401;
            ctx.body = {
                message: 'User or login information does not exist'
            };
            return;
        }
        ctx.status = 200;
        ctx.type = 'text/plain';
        ctx.body = 'Logout successful';
    } catch (err) {
        logger.error(`logout: Logout failed: ${err.message}`);
        ctx.status = 500;
        ctx.type = 'text/plain';
        ctx.body = 'Server Error';
    }
}

export default {
    'POST /logout': logout
};
