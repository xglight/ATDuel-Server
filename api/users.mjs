import pool from '../db.mjs';
import logger from '../logger.mjs';
import config from '../config.mjs';
import { verifyAdmin } from '../utils/auth.mjs';

/**
 * 获取所有用户列表 (管理员接口)
 * 支持通过用户名或 AtCoder 名进行模糊查询，并标记用户的封禁状态
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function getUsers(ctx) {
    const { query } = ctx.request.body;

    try {
        // 1. 验证管理员权限
        const isAdmin = await verifyAdmin(ctx);
        if (!isAdmin) {
            ctx.status = 403;
            ctx.body = { success: false, message: '未授权：需要管理员权限' };
            return;
        }

        logger.debug(`getUsers: 正在查询用户列表, 过滤器: ${query || '无'}`);

        // 2. 获取所有用户和封禁记录
        const [
            [users],
            [banRecords]
        ] = await Promise.all([
            pool.execute('SELECT id, username, ATName, avatar, rating FROM user'),
            pool.execute('SELECT username FROM user_ban WHERE endBanTime > CURRENT_TIMESTAMP')
        ]);

        // 3. 应用过滤条件
        let filteredUsers = users;
        if (query) {
            const lowerQuery = query.toLowerCase();
            filteredUsers = users.filter(user =>
                (user.username && user.username.toLowerCase().includes(lowerQuery)) ||
                (user.ATName && user.ATName.toLowerCase().includes(lowerQuery))
            );
        }

        // 4. 建立封禁集合
        const bannedUsernames = new Set(banRecords.map(b => b.username));

        // 5. 标记用户封禁状态
        const result = filteredUsers.map(user => ({
            ...user,
            isBanned: bannedUsernames.has(user.username)
        }));

        logger.debug(`getUsers: 成功获取 ${result.length} 个用户`);
        ctx.status = 200;
        ctx.body = { success: true, data: result };

    } catch (err) {
        logger.error(`getUsers 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

/**
 * 获取用户详细信息 (管理员接口)
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 * @returns {Promise<void>}
 */
async function getUserDetail(ctx) {
    const { userId, username } = ctx.request.body;

    if (!userId && !username) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'userId or username is required' };
        return;
    }

    try {
        // 1. 验证管理员权限
        const isAdmin = await verifyAdmin(ctx);
        if (!isAdmin) {
            ctx.status = 403;
            ctx.body = { success: false, message: 'Unauthorized: Admin access required' };
            return;
        }

        // 2. 获取用户信息
        let userRows;
        if (userId) {
            [userRows] = await pool.execute('SELECT id, username, ATName, avatar, rating FROM user WHERE id = ?', [userId]);
        } else {
            [userRows] = await pool.execute('SELECT id, username, ATName, avatar, rating FROM user WHERE username = ?', [username]);
        }

        if (userRows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: 'User not found' };
            return;
        }

        const user = userRows[0];

        // 3. 并行获取该用户的关联信息
        const [
            [banRecords],
            [contestCount],
            [recentContests]
        ] = await Promise.all([
            pool.execute('SELECT endBanTime, reason FROM user_ban WHERE username = ? ORDER BY endBanTime DESC LIMIT 1', [user.username]),
            pool.execute('SELECT COUNT(*) as count FROM contest_participants WHERE username = ?', [user.username]),
            pool.execute(`
                SELECT c.id, c.url, cp.place, cp.score 
                FROM contest c 
                JOIN contest_participants cp ON c.id = cp.contest_id 
                WHERE cp.username = ? 
                ORDER BY c.endTime DESC 
                LIMIT 5
            `, [user.username])
        ]);

        const lastBan = banRecords[0] || null;
        const isCurrentlyBanned = lastBan && new Date(lastBan.endBanTime) > new Date();
        user.totalContests = contestCount[0].count;
        user.recentContests = recentContests;

        logger.info(`getUserDetail: Fetched details for user ${user.username}`);

        ctx.status = 200;
        ctx.body = {
            success: true,
            data: {
                ...user,
                banInfo: lastBan,
                isBanned: isCurrentlyBanned
            }
        };

    } catch (err) {
        logger.error(`getUserDetail: Failed to fetch user details: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: 'Internal Server Error' };
    }
}

export default {
    'POST /admin/users': getUsers,
    'POST /admin/user_detail': getUserDetail
};