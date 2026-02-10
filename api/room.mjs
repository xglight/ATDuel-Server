// room.mjs

import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 获取单个房间详情接口
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function room(ctx) {
    const { id: roomUrl } = ctx.params;

    if (!roomUrl) {
        ctx.status = 400;
        ctx.body = { success: false, message: '房间 ID 不能为空' };
        return;
    }

    logger.debug(`room: 正在获取房间信息, URL: ${roomUrl}`);

    try {
        const [rows] = await pool.execute('SELECT * FROM room WHERE url = ? LIMIT 1', [roomUrl]);

        if (rows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '未找到该房间' };
            return;
        }

        const roomData = rows[0];

        // 获取房间成员
        const [participants] = await pool.execute(
            'SELECT username, team_label, avatar, place, ready FROM room_participants WHERE room_id = ?',
            [roomData.id]
        );

        // 构建前端需要的 team 和 user 格式
        const team = { A: [], B: [] };
        const user = {};

        participants.forEach(p => {
            if (team[p.team_label]) {
                team[p.team_label].push(p.username);
            }
            user[p.username] = {
                avatar: p.avatar,
                place: p.place,
                ready: !!p.ready
            };
        });

        const result = {
            id: roomData.id,
            url: roomData.url,
            master: roomData.master,
            team,
            user,
            setting: {
                mode: roomData.setting_mode,
                rating_lowest: roomData.setting_rating_lowest,
                rating_highest: roomData.setting_rating_highest,
                problem_count: roomData.setting_problem_count,
                categories: roomData.setting_categories
            },
            rated: roomData.rated,
            last_updated: roomData.last_updated
        };

        ctx.body = {
            success: true,
            data: result
        };
    } catch (err) {
        logger.error(`room 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'GET /room/:id': room
}
