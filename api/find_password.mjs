// find_password.mjs
import pool from '../db.mjs';
import bcrypt from 'bcrypt';
import logger from '../logger.mjs';
import { getAffiliationValue } from './check.mjs';

/**
 * 找回密码接口
 * 通过验证 AtCoder 账号的 Affiliation 字段来允许用户重置密码
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function findPassword(ctx) {
    const { username, ATName, newPassword, verifyToken } = ctx.request.body;

    if (!username || !ATName || !newPassword || !verifyToken) {
        ctx.status = 400;
        ctx.body = {
            success: false,
            message: '用户名、AtCoder ID、新密码和验证码不能为空'
        };
        return;
    }

    logger.debug(`find_password: 用户 ${username} 正在尝试通过 AtCoder (${ATName}) 找回密码`);

    try {
        // 1. 验证用户名和 AtCoder ID 是否匹配
        const [userRows] = await pool.execute(
            'SELECT username FROM user WHERE username = ? AND ATName = ? LIMIT 1',
            [username, ATName]
        );

        if (userRows.length === 0) {
            ctx.status = 400;
            ctx.body = { success: false, message: '用户名与 AtCoder ID 不匹配' };
            return;
        }

        // 2. 验证 AtCoder 上的 Token (Affiliation 字段)
        const affiliation = await getAffiliationValue(ATName);

        if (affiliation === null || affiliation.trim() !== verifyToken.trim()) {
            logger.debug(`find_password: 用户 ${ATName} 的 AtCoder 校验码不匹配或获取失败`);
            ctx.status = 400;
            ctx.body = { 
                success: false, 
                message: '校验码不匹配，请确保已在 AtCoder 个人简介的 Affiliation 字段填入正确的校验码' 
            };
            return;
        }

        // 3. 解码 Base64 密码并加密
        const decodedNewPassword = Buffer.from(newPassword, 'base64').toString();
        const hashedNewPassword = await bcrypt.hash(decodedNewPassword, 10);

        // 4. 更新密码并清除所有登录会话
        await pool.execute(
            'UPDATE user SET password = ? WHERE username = ?',
            [hashedNewPassword, username]
        );

        await pool.execute(
            'DELETE FROM login_status WHERE username = ?',
            [username]
        );

        logger.info(`find_password: 用户 ${username} 成功找回密码，已清除所有会话`);
        ctx.status = 200;
        ctx.body = {
            success: true,
            message: '密码重置成功，请使用新密码登录'
        };

    } catch (err) {
        logger.error(`find_password 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = {
            success: false,
            message: '服务器内部错误'
        };
    }
}

export default {
    'POST /find_password': findPassword
};
