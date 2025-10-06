// logout.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

async function logout(ctx, next) {
    const { username, token } = ctx.request.body;

    if (!username || !token) {
        ctx.status = 400;
        ctx.body = {
            message: '用户名或token不能为空'
        };
        return;
    }

    logger.debug(`logout: 用户 ${username} 登出`);

    try {
        const [rows] = await pool.execute('DELETE FROM login_status WHERE username=? AND token=?', [username, token]);
        if (rows.affectedRows === 0) {
            ctx.status = 401;
            ctx.body = {
                message: '用户或登录信息不存在'
            };
            return;
        }
        ctx.status = 200;
        ctx.type = 'text/plain';
        ctx.body = '登出成功';
    } catch (err) {
        logger.error(`logout: 登出失败: ${err.message}`);
        ctx.status = 500;
        ctx.type = 'text/plain';
        ctx.body = 'Server Error';
    }
}

export default {
    'POST /logout': logout
};
