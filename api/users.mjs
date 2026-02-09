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

    logger.debug(`getUsers: Querying users, query parameter: ${query}`);

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

        logger.debug(`getUsers: Found ${rows.length} users`);
        ctx.type = 'text/json';
        ctx.body = rows;
    } catch (err) {
        logger.error(`getUsers: Query error: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: 'Server Error' };
    }
}

/**
 * 获取用户详细信息 (管理员接口)
 * @param {Object} ctx Koa 上下文
 * @param {Function} next 下一个中间件
 */
async function getUserDetail(ctx, next) {
    const { token, userId, username } = ctx.request.body;

    if (!token || (!userId && !username)) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'token and (userId or username) can not be empty' };
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

    try {
        let users;
        if (userId) {
            [users] = await pool.execute('SELECT id, username, ATName, avatar, rating FROM user WHERE id = ?', [userId]);
        } else {
            [users] = await pool.execute('SELECT id, username, ATName, avatar, rating FROM user WHERE username = ?', [username]);
        }

        if (users.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: 'User not found' };
            return;
        }

        const user = users[0];

        // 获取封禁信息
        const [bans] = await pool.execute('SELECT endBanTime, reason FROM user_ban WHERE username = ? ORDER BY endBanTime DESC LIMIT 1', [user.username]);

        user.isBanned = false;
        user.banReason = null;
        user.endBanTime = null;

        if (bans.length > 0) {
            const lastBan = bans[0];
            if (new Date(lastBan.endBanTime) > new Date()) {
                user.isBanned = true;
                user.banReason = lastBan.reason;
                user.endBanTime = lastBan.endBanTime;
            }
        }

        // 获取参与比赛数
        const [contests] = await pool.execute('SELECT COUNT(*) as count FROM contest_participants WHERE username = ?', [user.username]);
        user.totalContests = contests[0].count;

        // 获取最近比赛
        const [recentContests] = await pool.execute(`
            SELECT c.id, c.url, cp.place, cp.score 
            FROM contest c 
            JOIN contest_participants cp ON c.id = cp.contest_id 
            WHERE cp.username = ? 
            ORDER BY c.endTime DESC 
            LIMIT 5
        `, [user.username]);
        user.recentContests = recentContests;

        ctx.body = { success: true, data: user };
    } catch (err) {
        logger.error(`getUserDetail: Error: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: 'Server Error' };
    }
}

export default {
    'POST /admin/users': getUsers,
    'POST /admin/user_detail': getUserDetail
};