// check_login.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

async function check_login(ctx, next) {
    const { username, token } = ctx.request.body;

    if (!username || !token) {
        ctx.body = { success: false, message: 'username or token can not be empty' };
        return;
    }
    logger.debug('check_login: Login check request: ', username, token);

    try {
        const [rows] = await pool.execute(
            'SELECT loginTime FROM login_status WHERE username = ? AND token = ? LIMIT 1',
            [username, token]
        );

        if (rows.length === 0) {
            ctx.status = 401;
            ctx.body = { success: false, message: 'user not login' };
            return;
        }

        const [rowsBan] = await pool.execute('SELECT * FROM user_ban WHERE username = ?', [username]);
        if (rowsBan.length > 0) {
            rowsBan.sort((a, b) => new Date(b.endBanTime) - new Date(a.endBanTime));
            for (const ban of rowsBan) {
                if (new Date(ban.endBanTime) > new Date()) {
                    ctx.status = 403;
                    ctx.body = { success: false, message: 'You have been banned from logging in until ' + ban.endBanTime };
                    return;
                }
            }
        }

        const loginTime = new Date(rows[0].loginTime);
        const now = Date.now();
        const rememberMe = rows[0].rememberMe || 0;
        const expireTime = rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

        if (now - loginTime.getTime() < expireTime) {
            await pool.execute(
                'UPDATE login_status SET loginTime = CURRENT_TIMESTAMP WHERE username = ? AND token = ?',
                [username, token]
            );
            ctx.body = { success: true, message: 'login success' };
        } else {
            await pool.execute(
                'DELETE FROM login_status WHERE username = ? AND token = ?',
                [username, token]
            );
            logger.debug('check_login: User ', username, ' login expired');
            ctx.status = 401;
            ctx.body = { success: false, message: 'login expired' };
        }
    } catch (error) {
        logger.error('check_login: Query error: ', error);
        ctx.status = 500;
        ctx.type = 'text/json';
        ctx.body = { success: false, message: 'Server Error' };
    }
}

export default {
    'POST /check_login': check_login
};
