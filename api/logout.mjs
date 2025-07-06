// logout.mjs
import pool from '../db.mjs';

async function logout(ctx, next) {
    const { username, token } = ctx.request.body;

    if (!username || !token) {
        console.log('logout: 用户名或 Token 为空');
        ctx.status = 400;
        ctx.body = {
            message: '用户名或token不能为空'
        };
        return;
    }
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
        console.error(err);
        ctx.status = 500;
        ctx.type = 'text/plain';
        ctx.body = 'Server Error';
    }
}

export default {
    'POST /logout': logout
};
