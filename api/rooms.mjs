// rooms.mjs

import pool from '../db.mjs';

async function rooms(ctx, next) {
    try {
        const [rows, fields] = await pool.query('SELECT * FROM rooms');

        let result = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const id = row.id;
            const url = row.url;
            const master = row.master;
            const user = row.user;
            const setting = row.setting;
            const rated = row.rated;
            result.push({
                id: id,
                url: url,
                master: master,
                user,
                setting,
                rated: rated
            });
        }
        try {
            result = JSON.stringify(result);
        } catch (e) { console.log(e) }
        ctx.type = 'text/json';
        ctx.status = 200;
        ctx.body = result;
    } catch (err) {
        console.error(err);
        ctx.status = 500;
        ctx.type = 'text/plain';
        ctx.body = 'Server Error';
        return;
    }
}

export default {
    'GET /rooms': rooms
}
