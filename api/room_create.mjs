// room_create.mjs

import pool from '../db.mjs';
import logger from '../logger.mjs';
import config from '../config.mjs';


/**
 * 生成随机字符串
 * 
 * @param {number} length - 字符串长度
 * @returns {string}
 */
function randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * 创建房间接口
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function createRoom(ctx) {
    const { username, token, playerCount, ratingMin, ratingMax, problemCount, isRated } = ctx.request.body;

    // 参数验证
    if (!username || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: '用户名和 Token 不能为空' };
        return;
    }

    logger.debug(`room_create: 正在为房主创建房间: ${username}`);

    try {
        // 校验 Token
        const [loginRows] = await pool.execute(
            'SELECT username FROM login_status WHERE username = ? AND token = ?',
            [username, token]
        );

        if (loginRows.length === 0) {
            ctx.status = 401;
            ctx.body = { success: false, message: '未登录或 Token 无效' };
            return;
        }

        const roomUrl = randomString(20);
        const now = new Date();

        const roomData = {
            url: roomUrl,
            master: username,
            setting_mode: playerCount || '1v1',
            setting_rating_lowest: ratingMin || 0,
            setting_rating_highest: ratingMax || 4000,
            setting_problem_count: problemCount || config.content.problemCountLowerLimit,
            rated: isRated ? 1 : 0,
            last_updated: now
        };

        // 插入数据库
        await pool.execute(
            'INSERT INTO room (url, master, setting_mode, setting_rating_lowest, setting_rating_highest, setting_problem_count, rated, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                roomData.url,
                roomData.master,
                roomData.setting_mode,
                roomData.setting_rating_lowest,
                roomData.setting_rating_highest,
                roomData.setting_problem_count,
                roomData.rated,
                roomData.last_updated
            ]
        );

        logger.info(`room_create: 房间创建成功: ${roomUrl}，房主: ${username}`);

        ctx.body = {
            success: true,
            data: roomData,
            message: '房间创建成功'
        };
    } catch (err) {
        logger.error(`room_create 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'POST /room_create': createRoom
}
