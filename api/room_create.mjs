// room_create.mjs

import pool from '../db.mjs';
import logger from '../logger.mjs';
import config from '../config.mjs';


function randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function createRoom(ctx, next) {
    try {
        // 解析请求体
        const body = ctx.request.body;

        // 参数验证
        if (!body.username || !body.token) {
            ctx.status = 400;
            ctx.body = { success: false, message: 'Missing required parameters' };
            return;
        }

        logger.debug(`room_create: Creating room, master user ${body.username}`);

        const roomUrl = randomString(20);
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

        const roomData = {
            url: roomUrl,
            master: body.username,
            setting_mode: body.playerCount || '1v1',
            setting_rating_lowest: body.ratingMin || 0,
            setting_rating_highest: body.ratingMax || 4000,
            setting_problem_count: body.problemCount || config.content.problemCountLowerLimit,
            rated: body.isRated || false,
        };

        // 插入数据库
        await pool.query(
            'INSERT INTO room SET ?',
            [roomData]
        );

        logger.info(`room_create: Room created successfully, URL ${roomUrl}`);
        // 返回成功响应
        ctx.status = 200;
        ctx.body = {
            success: true,
            room: roomData
        };

    } catch (err) {
        logger.error(`room_create: Failed to create room: ${err.message}`);
        ctx.status = 500;
        ctx.body = {
            success: false,
            message: 'Internal Server Error',
            error: err.message
        };
    }
}

export default {
    'POST /room_create': createRoom
}
