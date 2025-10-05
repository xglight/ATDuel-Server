// atavatar.mjs
import pool from '../db.mjs';

async function avatar(ctx, next) {
    const username = ctx.params.username;
    if (!username) {
        ctx.status = 400;
        ctx.body = { error: 'username is required' };
        return;
    }
    ctx.type = "text/plain"
    try {
        const [rows, fields] = await pool.query('SELECT * FROM user WHERE username = ?', [username]);

        if (rows.length === 0) {
            ctx.status = 404;
            ctx.body = 'user not found';
            return;
        }
        const avatarPath = rows[0].avatar;
        ctx.status = 200;
        ctx.body = avatarPath;
    } catch (err) {
        console.log(err);
        ctx.status = 500;
        ctx.body = 'Server Error';
        return;
    }
}

export default { 'GET /avatar/:username': avatar };