// check_login.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 检查登录状态接口
 * 验证用户的 token 是否有效，并检查用户是否被封禁
 *
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function check_login(ctx) {
    const { username, token } = ctx.request.body;

    if (!username || !token) {
        ctx.status = 400;
        ctx.body = {
            success: false,
            message: '用户名和 Token 均不能为空'
        };
        return;
    }

    logger.debug(`check_login: 正在检查用户 ${username} 的登录状态`);

    try {
        // 并行获取登录状态和封禁状态
        const [[loginRecords], [banRecords]] = await Promise.all([
            pool.execute(
                'SELECT loginTime, rememberMe FROM login_status WHERE username = ? AND token = ? LIMIT 1',
                [username, token]
            ),
            pool.execute(
                'SELECT endBanTime FROM user_ban WHERE username = ? AND endBanTime > CURRENT_TIMESTAMP ORDER BY endBanTime DESC LIMIT 1',
                [username]
            )
        ]);

        if (loginRecords.length === 0) {
            logger.debug(`check_login: 用户 ${username} 未登录或 Token 无效`);
            ctx.status = 401;
            ctx.body = { success: false, message: '用户未登录' };
            return;
        }

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

        // 3. 检查登录是否过期
        const loginTime = new Date(loginRecords[0].loginTime);
        const now = Date.now();
        const rememberMe = loginRecords[0].rememberMe || 0;

        // 如果勾选了记住我，有效期 7 天，否则 1 天
        const expireTime = rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

        if (now - loginTime.getTime() < expireTime) {
            // 延长登录有效期
            await pool.execute(
                'UPDATE login_status SET loginTime = CURRENT_TIMESTAMP WHERE username = ? AND token = ?',
                [username, token]
            );
            ctx.status = 200;
            ctx.body = { success: true, message: '登录状态有效' };
        } else {
            // 已过期，清理记录
            await pool.execute(
                'DELETE FROM login_status WHERE username = ? AND token = ?',
                [username, token]
            );
            logger.info(`check_login: 用户 ${username} 登录已过期`);
            ctx.status = 401;
            ctx.body = { success: false, message: '登录已过期，请重新登录' };
        }
    } catch (error) {
        logger.error(`check_login: 检查用户 ${username} 登录状态时发生错误: ${error.message}`);
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
