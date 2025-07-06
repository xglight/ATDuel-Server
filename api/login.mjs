// login.mjs
import pool from '../db.mjs';
import bcrypt from 'bcrypt';
async function login(ctx, next) {
    const { username, password } = ctx.request.body;
    if (!username || !password) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'username or password cannot be empty' };
        return;
    }


    ctx.type = 'text/json';
    try {
        const encodedPassword = atob(password);
        const [rows] = await pool.execute('SELECT password FROM user WHERE username = ?', [username]);
        if (rows.length > 0) {
            const hashedPassword = rows[0].password;
            const match = await bcrypt.compare(encodedPassword, hashedPassword);
            if (match) {
                ctx.status = 200;
                console.log('login: 用户', username, '登录成功');
                ctx.body = { success: true, message: 'login success' };
            } else {
                ctx.status = 401;
                console.log('login: 用户', username, '密码错误');
                ctx.body = { success: false, message: 'username or password error' };
            }
        } else {
            ctx.status = 404;
            console.log('login: 用户', username, '不存在');
            ctx.body = { success: false, message: 'username or password error' };
        }
    } catch (err) {
        console.error('login: 查询错误', err.stack);
        ctx.status = 500;
        ctx.body = { success: false, message: 'Server Error' };
    }
}

export default { 'POST /login': login };
