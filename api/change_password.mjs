import pool from '../db.mjs';
import bcrypt from 'bcrypt';
import logger from '../logger.mjs';

/**
 * 修改用户密码 API
 * @param {object} ctx - Koa context
 */
async function changePassword(ctx, next) {
    const { username, token, oldPassword, newPassword } = ctx.request.body;

    if (!username || !token || !oldPassword || !newPassword) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'Missing required fields' };
        return;
    }

    try {
        // 1. 验证登录状态
        const [statusRows] = await pool.execute(
            'SELECT loginTime FROM login_status WHERE username = ? AND token = ? LIMIT 1',
            [username, token]
        );

        if (statusRows.length === 0) {
            ctx.status = 401;
            ctx.body = { success: false, message: 'User not logged in' };
            return;
        }

        // 2. 解码并验证旧密码
        const decodedOldPassword = atob(oldPassword);
        const decodedNewPassword = atob(newPassword);

        const [userRows] = await pool.execute(
            'SELECT password FROM user WHERE username = ? LIMIT 1',
            [username]
        );

        if (userRows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: 'User not found' };
            return;
        }

        const match = await bcrypt.compare(decodedOldPassword, userRows[0].password);
        if (!match) {
            ctx.status = 401;
            ctx.body = { success: false, message: 'Current password incorrect' };
            return;
        }

        // 3. 更新新密码
        const hashedNewPassword = await bcrypt.hash(decodedNewPassword, 10);
        await pool.execute(
            'UPDATE user SET password = ? WHERE username = ?',
            [hashedNewPassword, username]
        );

        // 4. 清除所有登录状态（强制所有设备重新登录）
        await pool.execute(
            'DELETE FROM login_status WHERE username = ?',
            [username]
        );

        logger.info(`change_password: User ${username} changed password successfully`);
        ctx.body = { success: true, message: 'Password updated successfully' };
    } catch (err) {
        logger.error(`change_password: Error updating password for ${username}: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: 'Server Error' };
    }
}

export default {
    'POST /change_password': changePassword
};
