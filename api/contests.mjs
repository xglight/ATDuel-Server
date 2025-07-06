// contests.mjs
import pool from '../db.mjs';

async function contests(ctx, next) {
    try {
        const [rows, fields] = await pool.query('SELECT * FROM contest');
        rows.sort((a, b) => {
            if (a.status < b.status) {
                return -1;
            } else if (a.status > b.status) {
                return 1;
            } else {
                return b.id - a.id;
            }
        });

        let result = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const id = row.id;
            const url = row.url;
            const starttime = row.starttime;
            const endtime = row.endtime;
            const user = row.user;
            const rating = row.rating;
            const problem = row.problem;
            const status = row.status;
            const rated = row.rated;
            const scorea = row.scorea;
            const scoreb = row.scoreb;
            result.push({
                id: id,
                url: url,
                starttime: starttime,
                endtime: endtime,
                user,
                rating,
                problem,
                scorea: scorea,
                scoreb: scoreb,
                status: status,
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
    'GET /contests': contests
}
