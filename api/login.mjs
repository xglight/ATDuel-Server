// login.mjs
import pool from '../db.mjs';
import bcrypt from 'bcrypt';
import config from '../config.mjs';
import logger from '../logger.mjs';

async function login(ctx, next) {
    const { username, password } = ctx.request.body;
    if (!username || !password) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'username or password cannot be empty' };
        return;
    }

    logger.debug(`login: 用户 ${username} 登录`);

    ctx.type = 'text/json';
    try {
        const encodedPassword = atob(password);
        const [rows] = await pool.execute('SELECT password FROM user WHERE username = ?', [username]);
        const [rows2] = await pool.execute('SELECT ATName FROM user WHERE username = ?', [username]);
        if (rows.length > 0) {
            const hashedPassword = rows[0].password;
            const match = await bcrypt.compare(encodedPassword, hashedPassword);
            if (match) {
                ctx.status = 200;
                let avatar = await fetch(config.buildApiUrl(`/atavatar/${rows2[0].ATName}`)).then(res => res.text());
                await pool.execute('UPDATE user SET avatar = ? WHERE username = ?', [avatar, username]);
                logger.debug(`login: 用户 ${username} 登录成功`);
                ctx.body = { success: true, message: 'login success' };
            } else {
                ctx.status = 401;
                logger.debug(`login: 用户 ${username} 密码错误`);
                ctx.body = { success: false, message: 'username or password error' };
            }
        } else {
            ctx.status = 404;
            logger.debug(`login: 用户 ${username} 不存在`);
            ctx.body = { success: false, message: 'username or password error' };
        }
    } catch (err) {
        logger.error(`login: 查询错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: 'Server Error' };
    }
}

export default { 'POST /login': login };
