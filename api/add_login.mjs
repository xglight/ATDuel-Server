//add_login.mjs
import pool from '../db.mjs';

async function add_login(ctx, next) {
    const { username, token } = ctx.request.body;

    if (!username || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'username or token can not be empty' };
        return;
    }
    ctx.type = 'text/json';
    try {
        const rememberMe = ctx.request.body.rememberMe || 0;
        await pool.execute(
            `INSERT INTO login_status (username, token, loginTime, rememberMe) 
             VALUES (?, ?, CURRENT_TIMESTAMP, ?) 
             ON DUPLICATE KEY UPDATE loginTime = CURRENT_TIMESTAMP, rememberMe = VALUES(rememberMe)`,
            [username, token, rememberMe]
        );

        console.log('add_login: 用户', username, '登录信息已添加或更新');
        ctx.status = 200;
        ctx.body = { success: true, message: 'add login success' };
    } catch (error) {
        console.error('add_login: 处理出错:', error);
        ctx.status = 500;
        ctx.body = { success: false, message: 'Server Error' };
    }
}

export default {
    'POST /add_login': add_login
};
