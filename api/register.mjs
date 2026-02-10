// register.mjs
import pool from '../db.mjs';
import bcrypt from 'bcrypt';
import config from '../config.mjs';
import logger from '../logger.mjs';
import { getAtRatingValue } from './atRating.mjs';
import { getAtAvatarPath } from './atAvator.mjs';

/**
 * 用户注册接口
 * 处理新用户注册，包括用户名查重、AtCoder 账号验证、Rating 检查及头像获取
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function register(ctx) {
    const { username, password, ATName } = ctx.request.body;

    if (!username || !password || !ATName) {
        ctx.status = 400;
        ctx.body = {
            success: false,
            message: '用户名、密码和 AtCoder ID 不能为空'
        };
        return;
    }

    logger.debug(`register: 正在尝试注册用户: ${username} (AtCoder: ${ATName})`);

    try {
        // 1. 并行检查用户名和 AtCoder 名是否已存在
        const [existingUsers, existingAtNames] = await Promise.all([
            pool.execute('SELECT 1 FROM user WHERE username = ? LIMIT 1', [username]),
            pool.execute('SELECT 1 FROM user WHERE ATName = ? LIMIT 1', [ATName])
        ]);

        if (existingUsers[0].length > 0) {
            ctx.status = 400;
            ctx.body = { success: false, message: '用户名已存在' };
            return;
        }

        if (existingAtNames[0].length > 0) {
            ctx.status = 400;
            ctx.body = { success: false, message: '该 AtCoder ID 已被注册' };
            return;
        }

        // 2. 获取 AtCoder Rating 和头像 (并行获取)
        const [rating, avatar] = await Promise.all([
            getAtRatingValue(ATName),
            getAtAvatarPath(ATName)
        ]);

        if (rating === null) {
            ctx.status = 400;
            ctx.body = { success: false, message: `无法验证 AtCoder 账号: ${ATName}` };
            return;
        }

        // 3. 检查 Rating 限制
        if (rating < config.register.ratingLowerLimit) {
            ctx.status = 400;
            ctx.body = {
                success: false,
                message: `您的 AtCoder Rating (${rating}) 必须至少达到 ${config.register.ratingLowerLimit} 才能注册`
            };
            return;
        }

        // 4. 加密密码并保存用户
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.execute(
            'INSERT INTO user (username, password, ATName, rating, avatar) VALUES (?, ?, ?, ?, ?)',
            [username, hashedPassword, ATName, rating, avatar || '']
        );

        logger.info(`register: 用户 ${username} 注册成功，Rating: ${rating}`);
        ctx.status = 200;
        ctx.body = {
            success: true,
            message: '注册成功'
        };

    } catch (err) {
        logger.error(`register 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = {
            success: false,
            message: '服务器内部错误'
        };
    }
}

export default {
    'POST /register': register
};
