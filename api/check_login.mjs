import pool from '../db.mjs';
import logger from '../logger.mjs';
import { verifyUser } from '../utils/auth.mjs';

/**
 * 检查登录状态接口
 * 验证用户的 token 是否有效，并检查用户是否被封禁
 *
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function check_login(ctx) {
    logger.debug(`check_login: 正在检查登录状态`);

    try {
        const authResult = await verifyUser(ctx);
        if (!authResult.success) {
            ctx.status = 401;
            ctx.body = { success: false, message: '未登录或已过期' };
            return;
        }

        const { username, token, rememberMe } = authResult;

        // 检查封禁状态
        const [banRecords] = await pool.execute(
            'SELECT endBanTime FROM user_ban WHERE username = ? AND endBanTime > CURRENT_TIMESTAMP ORDER BY endBanTime DESC LIMIT 1',
            [username]
        );

        if (banRecords.length > 0) {
            const activeBan = banRecords[0];
            logger.info(`check_login: 用户 ${username} 已被封禁，截止时间：${activeBan.endBanTime}`);
            ctx.status = 403;
            ctx.body = {
                success: false,
                message: `您已被封禁，截止时间：${activeBan.endBanTime}`
            };
            return;
        }

        // 登录有效且未封禁，续租 Cookie (延长有效期)
        const maxAge = (rememberMe ? 7 : 1) * 24 * 60 * 60 * 1000;

        ctx.cookies.set('username', username, {
            maxAge,
            httpOnly: false,
            path: '/',
            overwrite: true
        });
        ctx.cookies.set('token', token, {
            maxAge,
            httpOnly: true,
            path: '/',
            overwrite: true
        });

        ctx.status = 200;
        ctx.body = {
            success: true,
            message: '登录状态有效',
            data: { username }
        };
    } catch (error) {
        logger.error(`check_login: 检查登录状态时发生错误: ${error.message}`);
        ctx.status = 500;
        ctx.body = {
            success: false,
            message: '服务器内部错误'
        };
    }
}

export default {
    'POST /check_login': check_login
};
