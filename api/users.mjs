import pool from '../db.mjs';
import logger from '../logger.mjs';
import config from '../config.mjs';


async function getUsers(ctx, next) {
    const { token, query } = ctx.request.body;

    if (!token) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'token can not be empty' };
        return;
    }

    const res = await fetch(config.buildApiUrl('/admin/check'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: token }),
    }).then(res => res.json());
    if (res.success == false) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'Token is invalid.' };
        return;
    }

    logger.debug(`getUsers: 正在查询用户，查询参数: ${query}`);

    try {
        const [rows] = await pool.execute('SELECT id, username, ATName, avatar, rating FROM user');

        if (query) {
            rows = rows.filter(row => row.username.includes(query) || row.ATName.includes(query));
        }

        let [rowsBan] = await pool.execute('SELECT username, endBanTime FROM user_ban');

        rowsBan = rowsBan.filter(ban => new Date(ban.endBanTime) > new Date());

        for (const row of rows) {
            row.isBanned = rowsBan.some(ban => ban.username === row.username);
        }

        logger.debug(`getUsers: 查询到 ${rows.length} 个用户`);
        ctx.type = 'text/json';
        ctx.body = rows;
    } catch (err) {
        logger.error(`getUsers: 查询错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: 'Server Error' };
    }
}

export default { 'POST /admin/users': getUsers };