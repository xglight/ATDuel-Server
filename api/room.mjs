// room.mjs

import pool from '../db.mjs';
import logger from '../logger.mjs';

async function room(ctx, next) {
    try {
        const id = ctx.params.id;
        const [rows, fields] = await pool.query(`SELECT * FROM room WHERE url =?`, [id]);

        if (rows.length === 0) {
            ctx.status = 404;
            ctx.type = 'text/plain';
            ctx.body = 'Room not found';
            return;
        }

        logger.info(`room: Fetching room information: ${id}`);

        const room = rows[0];
        // 获取房间成员
        const [participants] = await pool.query(
            `SELECT * FROM room_participants WHERE room_id = ?`,
            [room.id]
        );

        // 构建前端需要的 team 和 user 格式
        const team = { A: [], B: [] };
        const user = {};
        participants.forEach(p => {
            team[p.team_label].push(p.username);
            user[p.username] = {
                avatar: p.avatar,
                place: p.place,
                ready: !!p.ready
            };
        });

        const setting = {
            mode: room.setting_mode,
            rating_lowest: room.setting_rating_lowest,
            rating_highest: room.setting_rating_highest,
            problem_count: room.setting_problem_count
        };

        let result = {
            id: room.id,
            url: room.url,
            master: room.master,
            team,
            user,
            setting,
            rated: room.rated,
            last_updated: room.last_updated
        }
        ctx.status = 200;
        ctx.type = 'text/json';
        ctx.body = result;
    } catch (err) {
        logger.error(`room: Failed to fetch room information: ${err.message}`);
        ctx.status = 500;
        ctx.type = 'text/plain';
        ctx.body = 'Server Error';
        return;
    }
}

export default {
    'GET /room/:id': room
}
