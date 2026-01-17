// rooms.mjs

import pool from '../db.mjs';
import logger from '../logger.mjs';

async function rooms(ctx, next) {
    try {
        const [rows, fields] = await pool.query('SELECT * FROM room');
        logger.info(`rooms: Fetched room list: ${rows.length} rooms`);

        // 获取所有房间的成员
        const [allParticipants] = await pool.query('SELECT * FROM room_participants');
        const participantsMap = {};
        allParticipants.forEach(p => {
            if (!participantsMap[p.room_id]) {
                participantsMap[p.room_id] = { team: { A: [], B: [] }, user: {} };
            }
            participantsMap[p.room_id].team[p.team_label].push(p.username);
            participantsMap[p.room_id].user[p.username] = {
                avatar: p.avatar,
                place: p.place,
                ready: !!p.ready
            };
        });

        let result = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const pData = participantsMap[row.id] || { team: { A: [], B: [] }, user: {} };

            result.push({
                id: row.id,
                url: row.url,
                master: row.master,
                team: pData.team,
                user: pData.user,
                setting: {
                    mode: row.setting_mode,
                    rating_lowest: row.setting_rating_lowest,
                    rating_highest: row.setting_rating_highest,
                    problem_count: row.setting_problem_count
                },
                rated: row.rated
            });
        }
        try {
            result = JSON.stringify(result);
        } catch (e) { logger.error(`rooms: Failed to parse JSON: ${e.message}`) }
        ctx.type = 'text/json';
        ctx.status = 200;
        ctx.body = result;
    } catch (err) {
        logger.error(`rooms: Failed to fetch room list: ${err.message}`);
        ctx.status = 500;
        ctx.type = 'text/plain';
        ctx.body = 'Server Error';
        return;
    }
}

export default {
    'GET /rooms': rooms
}
