// login.mjs
import pool from '../db.mjs';
import bcrypt from 'bcrypt';
import logger from '../logger.mjs';
import { getAtAvatarPath } from './atAvator.mjs';

/**
 * 用户登录接口
 * 处理用户登录验证、封禁检查、头像更新及登录状态记录
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function login(ctx) {
    const { username, password, token, rememberMe = 0 } = ctx.request.body;

    if (!username || !password || !token) {
        ctx.status = 400;
        ctx.body = {
            success: false,
            message: '用户名、密码和 Token 不能为空'
        };
        return;
    }

    logger.debug(`login: 用户 ${username} 正在尝试登录`);

    try {
        // 解码 Base64 密码
        const decodedPassword = Buffer.from(password, 'base64').toString();

        // 获取用户信息及封禁状态
        const [users] = await pool.execute('SELECT password, ATName FROM user WHERE username = ? LIMIT 1', [username]);

        // 检查用户是否存在
        if (users.length === 0) {
            logger.debug(`login: 用户 ${username} 不存在`);
            ctx.status = 401;
            ctx.body = {
                success: false,
                message: '用户名或密码错误'
            };
            return;
        }

        const user = users[0];

        // 检查封禁状态
        const [banRecords] = await pool.execute(
            'SELECT endBanTime, reason FROM user_ban WHERE username = ? AND endBanTime > CURRENT_TIMESTAMP ORDER BY endBanTime DESC LIMIT 1',
            [username]
        );

        if (banRecords.length > 0) {
            const activeBan = banRecords[0];
            logger.info(`login: 用户 ${username} 被封禁至 ${activeBan.endBanTime}`);
            ctx.status = 403;
            ctx.body = {
                success: false,
                message: `您已被封禁至 ${activeBan.endBanTime}，原因: ${activeBan.reason}`
            };
            return;
        }

        // 验证密码
        const isPasswordMatch = await bcrypt.compare(decodedPassword, user.password);
        if (!isPasswordMatch) {
            logger.debug(`login: 用户 ${username} 密码错误`);
            ctx.status = 401;
            ctx.body = {
                success: false,
                message: '用户名或密码错误'
            };
            return;
        }

        // 登录成功处理
        // 1. 更新头像 (异步不阻塞登录)
        getAtAvatarPath(user.ATName).then(avatar => {
            if (avatar) {
                pool.execute('UPDATE user SET avatar = ? WHERE username = ?', [avatar, username])
                    .catch(err => logger.warn(`login: 无法为 ${username} 保存头像: ${err.message}`));
            }
        }).catch(err => logger.warn(`login: 无法为 ${username} 获取头像: ${err.message}`));

        // 2. 记录登录状态
        await pool.execute(
            `INSERT INTO login_status (username, token, loginTime, rememberMe) 
             VALUES (?, ?, CURRENT_TIMESTAMP, ?) 
             ON DUPLICATE KEY UPDATE loginTime = CURRENT_TIMESTAMP, rememberMe = VALUES(rememberMe)`,
            [username, token, rememberMe]
        );

        logger.info(`login: 用户 ${username} 登录成功`);
        ctx.status = 200;
        ctx.body = {
            success: true,
            message: '登录成功'
        };
    } catch (err) {
        logger.error(`login 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = {
            success: false,
            message: '服务器内部错误'
        };
    }
}

export default { 'POST /login': login };
