// login.mjs
import pool from '../db.mjs';
import bcrypt from 'bcrypt';
import config from '../config.mjs';
import logger from '../logger.mjs';

async function login(ctx, next) {
    const { username, password, token, rememberMe } = ctx.request.body;
    console.log(ctx.request.body);
    if (!username || !password || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'username or password or token or rememberMe cannot be empty' };
        return;
    }

    logger.debug(`login: 用户 ${username} 登录`);

    ctx.type = 'text/json';
    try {
        const encodedPassword = atob(password);
        const [rows] = await pool.execute('SELECT password FROM user WHERE username = ?', [username]);
        const [rows2] = await pool.execute('SELECT ATName FROM user WHERE username = ?', [username]);
        const [rowsBan] = await pool.execute('SELECT * FROM user_ban WHERE username = ?', [username]);
        if (rowsBan.length > 0) {
            rowsBan.sort((a, b) => new Date(b.endBanTime) - new Date(a.endBanTime));
            for (const ban of rowsBan) {
                if (new Date(ban.endBanTime) > new Date()) {
                    ctx.status = 403;
                    ctx.body = { success: false, message: '你已被禁止登录，直到 ' + ban.endBanTime };
                    return;
                }
            }
        }

        if (rows.length > 0) {
            const hashedPassword = rows[0].password;
            const match = await bcrypt.compare(encodedPassword, hashedPassword);
            if (match) {
                ctx.status = 200;
                let avatar = await fetch(config.buildApiUrl(`/atavatar/${rows2[0].ATName}`)).then(res => res.text());
                await pool.execute('UPDATE user SET avatar = ? WHERE username = ?', [avatar, username]);
                const rememberMe = ctx.request.body.rememberMe || 0;
                await pool.execute(
                    `INSERT INTO login_status (username, token, loginTime, rememberMe) VALUES (?, ?, CURRENT_TIMESTAMP, ?) ON DUPLICATE KEY UPDATE loginTime = CURRENT_TIMESTAMP, rememberMe = VALUES(rememberMe)`,
                    [username, token, rememberMe]
                );
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
