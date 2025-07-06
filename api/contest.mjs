// contest.mjs
import pool from '../db.mjs';

async function contest(ctx, next) {
    const id = ctx.params.id;
    try {
        const [rows, fields] = await pool.query(`SELECT * FROM contest WHERE url = ?`, [id]);

        if (rows.length === 0) {
            ctx.status = 404;
            ctx.type = 'text/plain';
            ctx.body = '比赛不存在';
            return;
        }

        let result;

        try {
            result = JSON.stringify(rows[0]);
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
    'GET /contest/:id': contest
}
