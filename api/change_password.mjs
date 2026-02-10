import pool from '../db.mjs';
import bcrypt from 'bcrypt';
import logger from '../logger.mjs';

/**
 * 修改用户密码接口
 * 验证当前密码并更新为新密码，更新后将强制该用户在所有设备上重新登录
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function changePassword(ctx) {
    const { username, token, oldPassword, newPassword } = ctx.request.body;

    if (!username || !token || !oldPassword || !newPassword) {
        ctx.status = 400;
        ctx.body = {
            success: false,
            message: '用户名、Token、当前密码和新密码均不能为空'
        };
        return;
    }

    logger.debug(`change_password: 用户 ${username} 正在尝试修改密码`);

    try {
        // 1. 验证登录状态
        const [statusRows] = await pool.execute(
            'SELECT username FROM login_status WHERE username = ? AND token = ? LIMIT 1',
            [username, token]
        );

        if (statusRows.length === 0) {
            ctx.status = 401;
            ctx.body = { success: false, message: '未登录或 Token 无效' };
            return;
        }

        // 2. 解码 Base64 密码并验证旧密码
        const decodedOldPassword = Buffer.from(oldPassword, 'base64').toString();
        const decodedNewPassword = Buffer.from(newPassword, 'base64').toString();

        const [userRows] = await pool.execute(
            'SELECT password FROM user WHERE username = ? LIMIT 1',
            [username]
        );

        if (userRows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '用户不存在' };
            return;
        }

        const isMatch = await bcrypt.compare(decodedOldPassword, userRows[0].password);
        if (!isMatch) {
            logger.debug(`change_password: 用户 ${username} 提供的当前密码错误`);
            ctx.status = 401;
            ctx.body = { success: false, message: '当前密码错误' };
            return;
        }

        // 3. 加密新密码并更新
        const hashedNewPassword = await bcrypt.hash(decodedNewPassword, 10);
        await pool.execute(
            'UPDATE user SET password = ? WHERE username = ?',
            [hashedNewPassword, username]
        );

        // 4. 强制退出所有登录（出于安全考虑）
        await pool.execute(
            'DELETE FROM login_status WHERE username = ?',
            [username]
        );

        logger.info(`change_password: 用户 ${username} 成功修改密码，已清除所有会话`);
        ctx.body = {
            success: true,
            message: '密码修改成功，请重新登录'
        };
    } catch (err) {
        logger.error(`change_password 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = {
            success: false,
            message: '服务器内部错误'
        };
    }
}

export default {
    'POST /change_password': changePassword
};
