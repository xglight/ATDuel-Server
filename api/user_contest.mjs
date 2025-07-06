// user_contest.mjs
import pool from '../db.mjs';

async function user_contest(ctx, next) {
    const username = ctx.params.username;
    if (!username) {
        ctx.status = 400;
        ctx.body = { error: 'username is required' };
        return;
    }
    try {
        const contestid = await fetch("http://10.0.3.113:3001/user_contestid/" + username, { method: 'GET' }).then(response => response.json());
        if (contestid.user_contest == null) {
            ctx.status = 200;
            ctx.type = 'text/json';
            ctx.body = {};
            return;
        }
        let data = [];
        for (let i = 0; i < contestid.user_contest.length; i++) {
            let id = contestid.user_contest[i];
            try {
                const [rows, fields] = await pool.execute('SELECT * FROM contest WHERE id =?', [id]);
                if (rows.length === 0) {
                    ctx.status = 200;
                    ctx.type = 'text/json';
                    ctx.body = {};
                    return;
                }
                const starttime = rows[0].starttime;
                const endtime = rows[0].endtime;
                const user = rows[0].user;
                const rating = rows[0].rating;
                const problem = rows[0].problem;
                const status = rows[0].status;
                data.push({
                    id: id,
                    starttime: starttime,
                    endtime: endtime,
                    user,
                    rating,
                    problem,
                    status: status
                });
            } catch (err) {
                console.log(err);
                ctx.status = 500;
                ctx.type = 'text/plain';
                ctx.body = 'Server Error';
                return;
            }
        }
        ctx.status = 200;
        ctx.type = 'text/json';
        ctx.body = data;
    } catch (err) {
        console.log(err);
        ctx.status = 500;
        ctx.type = 'text/plain';
        ctx.body = 'Server Error';
        return;
    }
}

export default { 'GET /user_contest/:username': user_contest };