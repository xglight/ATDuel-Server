import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 校验用户权限
 * 
 * @param {import('koa').Context|{username: string, token: string}} ctxOrAuth - Koa 上下文或包含 username 和 token 的对象
 * @returns {Promise<{success: boolean, username?: string, token?: string, rememberMe?: boolean}>} 校验结果
 */
export async function verifyUser(ctxOrAuth) {
    let username, token;

    if (ctxOrAuth && ctxOrAuth.cookies) {
        // Koa context
        username = ctxOrAuth.cookies.get('username');
        token = ctxOrAuth.cookies.get('token');
    } else {
        // Direct auth object (WebSocket etc.)
        username = ctxOrAuth?.username;
        token = ctxOrAuth?.token;
    }

    if (!username || !token) {
        return { success: false };
    }

    try {
        const [rows] = await pool.execute(
            'SELECT loginTime, rememberMe FROM login_status WHERE username = ? AND token = ? LIMIT 1',
            [username, token]
        );

        if (rows.length === 0) return { success: false };

        const loginTime = new Date(rows[0].loginTime);
        const rememberMe = !!rows[0].rememberMe;
        const expireTime = (rememberMe ? 7 : 1) * 24 * 60 * 60 * 1000;

        if (Date.now() - loginTime.getTime() < expireTime) {
            // 异步更新最后活跃时间
            pool.execute(
                'UPDATE login_status SET loginTime = CURRENT_TIMESTAMP WHERE username = ? AND token = ?',
                [username, token]
            ).catch(err => logger.error(`verifyUser: 更新活跃时间失败: ${err.message}`));

            return { success: true, username, token, rememberMe };
        } else {
            // 已过期，删除记录
            pool.execute('DELETE FROM login_status WHERE username = ? AND token = ?', [username, token])
                .catch(err => logger.error(`verifyUser: 删除过期 Token 失败: ${err.message}`));
            return { success: false };
        }
    } catch (err) {
        logger.error(`verifyUser: 鉴权检查失败: ${err.message}`);
        return { success: false };
    }
}

/**
 * 校验管理员权限
 * 
 * @param {string|import('koa').Context} tokenOrCtx - 管理员 Token 或 Koa 上下文
 * @returns {Promise<boolean>} 是否校验通过
 */
export async function verifyAdmin(tokenOrCtx) {
    let token;
    if (typeof tokenOrCtx === 'string') {
        token = tokenOrCtx;
    } else {
        token = tokenOrCtx.cookies.get('admin_token');
    }

    if (!token) return false;
    try {
        const [rows] = await pool.execute(
            'SELECT loginTime FROM admin_status WHERE token = ? LIMIT 1',
            [token]
        );

        if (rows.length === 0) return false;

        const loginTime = new Date(rows[0].loginTime);
        const expireTime = 24 * 60 * 60 * 1000; // 24小时过期

        if (Date.now() - loginTime.getTime() < expireTime) {
            // 异步更新最后活跃时间
            pool.execute(
                'UPDATE admin_status SET loginTime = CURRENT_TIMESTAMP WHERE token = ?',
                [token]
            ).catch(err => logger.error(`verifyAdmin: 更新活跃时间失败: ${err.message}`));
            return true;
        } else {
            // 已过期，删除记录
            pool.execute('DELETE FROM admin_status WHERE token = ?', [token])
                .catch(err => logger.error(`verifyAdmin: 删除过期 Token 失败: ${err.message}`));
            return false;
        }
    } catch (err) {
        logger.error(`verifyAdmin: 鉴权检查失败: ${err.message}`);
        return false;
    }
}
