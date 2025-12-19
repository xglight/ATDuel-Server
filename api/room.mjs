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

        logger.info(`room: 获取房间信息: ${id}`);

        const team = rows[0].team;
        const user = rows[0].user;
        const setting = rows[0].setting;
        let result = {
            id: rows[0].id,
            url: rows[0].url,
            master: rows[0].master,
            team,
            user,
            setting,
            rated: rows[0].rated,
            last_updated: rows[0].last_updated
        }
        ctx.status = 200;
        ctx.type = 'text/json';
        ctx.body = result;
    } catch (err) {
        logger.error(`room: 获取房间信息失败: ${err.message}`);
        ctx.status = 500;
        ctx.type = 'text/plain';
        ctx.body = 'Server Error';
        return;
    }
}

export default {
    'GET /room/:id': room
}
