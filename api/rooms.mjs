// rooms.mjs

import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 获取所有房间列表接口
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function rooms(ctx) {
    const page = parseInt(ctx.query.page) || 1;
    const limit = parseInt(ctx.query.limit) || 10;
    const offset = (page - 1) * limit;

    logger.debug(`rooms: 正在获取第 ${page} 页房间列表 (limit: ${limit})`);

    try {
        // 获取总数
        const [countRows] = await pool.execute('SELECT COUNT(*) as total FROM room');
        const total = countRows[0].total;

        // 获取分页房间
        const [rows] = await pool.execute(
            'SELECT * FROM room ORDER BY id DESC LIMIT ? OFFSET ?',
            [limit.toString(), offset.toString()]
        );

        if (rows.length === 0) {
            ctx.status = 200;
            ctx.body = { success: true, data: [], total: total };
            return;
        }

        const roomIds = rows.map(r => r.id);

        // 获取这些房间的成员
        const [allParticipants] = await pool.query(
            'SELECT * FROM room_participants WHERE room_id IN (?)',
            [roomIds]
        );

        // 按 room_id 分组参与者
        const participantsMap = {};
        allParticipants.forEach(p => {
            if (!participantsMap[p.room_id]) {
                participantsMap[p.room_id] = {
                    team: { A: [], B: [] },
                    user: {}
                };
            }

            const roomData = participantsMap[p.room_id];
            if (roomData.team[p.team_label]) {
                roomData.team[p.team_label].push(p.username);
            }

            roomData.user[p.username] = {
                avatar: p.avatar,
                place: p.place,
                ready: !!p.ready
            };
        });

        // 构建返回结果
        const result = rows.map(row => {
            const pData = participantsMap[row.id] || { team: { A: [], B: [] }, user: {} };

            return {
                id: row.id,
                url: row.url,
                master: row.master,
                team: pData.team,
                user: pData.user,
                setting: {
                    mode: row.setting_mode,
                    rating_lowest: row.setting_rating_lowest,
                    rating_highest: row.setting_rating_highest,
                    problem_count: row.setting_problem_count,
                    categories: row.setting_categories
                },
                rated: row.rated
            };
        });

        logger.debug(`rooms: 成功获取 ${result.length} 个房间`);

        ctx.status = 200;
        ctx.body = {
            success: true,
            data: result,
            total: total
        };
    } catch (err) {
        logger.error(`rooms 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'GET /rooms': rooms
}
