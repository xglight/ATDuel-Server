// room_create.mjs

import pool from '../db.mjs';

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
            ctx.body = { success: false, message: '缺少必要参数' };
            return;
        }
        const roomUrl = randomString(20);
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

        const roomData = {
            url: roomUrl,
            master: body.username,
            user: JSON.stringify({
                A: [],
                B: []
            }),
            setting: JSON.stringify({
                mode: body.playerCount || '1v1',
                rating_lowest: body.ratingMin || 0,
                rating_highest: body.ratingMax || 3000,
                problem_count: body.problemCount || 1,
            }),
            rated: body.isRated || false,
        };

        // 插入数据库
        await pool.query(
            'INSERT INTO rooms SET ?',
            [roomData]
        );

        console.log('创建房间成功:', roomData);
        // 返回成功响应
        ctx.status = 200;
        ctx.body = {
            success: true,
            room: roomData
        };

    } catch (err) {
        console.error('创建房间错误:', err);
        ctx.status = 500;
        ctx.body = {
            success: false,
            message: '服务器错误',
            error: err.message
        };
    }
}

export default {
    'POST /room_create': createRoom
}
