// room_create.mjs

import pool from '../db.mjs';
import logger from '../logger.mjs';
import config from '../config.mjs';
import { verifyUser } from '../utils/auth.mjs';


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
    const { playerCount, difficultyMin, difficultyMax, problemCount, isRated, categories } = ctx.request.body;

    logger.debug(`room_create: 正在创建房间`);

    try {
        // 校验 Token
        const authResult = await verifyUser(ctx);
        if (!authResult.success) {
            ctx.status = 401;
            ctx.body = { success: false, message: '未登录或已过期' };
            return;
        }

        const username = authResult.username;
        logger.debug(`room_create: 正在为房主创建房间: ${username}`);

        const roomUrl = randomString(20);
        const now = new Date();

        // 校验人数限制
        const teamSize = parseInt((playerCount || '1v1').split(/v/i)[0]);
        if (teamSize > config.content.peopleLimit) {
            ctx.status = 400;
            ctx.body = {
                success: false,
                message: `创建失败：目标模式 (${playerCount}) 超过了系统允许的最大人数 (${config.content.peopleLimit}v${config.content.peopleLimit})。`
            };
            return;
        }

        // 格式化 categories，确保是字符串
        let categoriesStr = '';
        if (Array.isArray(categories)) {
            categoriesStr = categories.join(',');
        } else if (typeof categories === 'string') {
            categoriesStr = categories;
        } else {
            // 默认使用配置中的类别
            categoriesStr = config.content.categories;
        }

        const roomData = {
            url: roomUrl,
            master: username,
            setting_mode: playerCount || '1v1',
            setting_rating_lowest: difficultyMin !== undefined ? difficultyMin : config.content.problemDifficultyLowerLimit,
            setting_rating_highest: difficultyMax !== undefined ? difficultyMax : config.content.problemDifficultyUpperLimit,
            setting_problem_count: problemCount || config.content.problemCountLowerLimit,
            setting_categories: categoriesStr,
            rated: isRated ? 1 : 0,
            last_updated: now
        };

        // 插入数据库
        await pool.execute(
            'INSERT INTO room (url, master, setting_mode, setting_rating_lowest, setting_rating_highest, setting_problem_count, setting_categories, rated, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                roomData.url,
                roomData.master,
                roomData.setting_mode,
                roomData.setting_rating_lowest,
                roomData.setting_rating_highest,
                roomData.setting_problem_count,
                roomData.setting_categories,
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
