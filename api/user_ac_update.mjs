import pool from '../db.mjs';
import logger from '../logger.mjs';

export async function updateUserAC(username) {
    const [rows] = await pool.query(
        'SELECT acLastUpdate FROM user WHERE username = ?', [username]);

    if (rows.length === 0) {
        return { error: 'user not found' };
    }

    const now = Math.floor(new Date().getTime() / 1000);
    const baseUrl = 'https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=' + username + '&from_second=';

    let lastUpdate = rows[0].acLastUpdate;
    let url = baseUrl + lastUpdate;

    while (true) {
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data.length === 0) {
                break;
            }
            for (const item of data) {
                if (item.result === 'AC') {
                    const name = item.problem_id;
                    try {
                        const [rows] = await pool.query(
                            'SELECT * FROM user_problem_accept WHERE username = ? AND problem_id = ?'
                            , [username, name]);
                        if (rows.length > 0) {
                            continue;
                        }
                        await pool.execute(
                            'INSERT IGNORE INTO user_problem_accept (username, problem_id) VALUES (?,?)'
                            , [username, name]);
                    } catch (error) {
                        logger.error('Failed to insert data:', error);
                    }
                }
                lastUpdate = Math.max(lastUpdate, item.epoch_second + 1);
            }
            url = baseUrl + lastUpdate;
        } catch (err) {
            logger.error(`updateUserAC: Failed to fetch submissions for user ${username}: ${err.message}`);
            return { error: 'fetch failed' };
        }
    }

    await pool.execute(
        'UPDATE user SET acLastUpdate = ? WHERE username = ?'
        , [now, username]);
    return { success: true };
}

async function user_ac_update(ctx, next) {
    const username = ctx.request.body.username;

    if (!username) {
        ctx.response.status = 400;
        ctx.response.body = { error: 'username is required' };
        return;
    }

    const result = await updateUserAC(username);
    if (result.error) {
        ctx.response.status = result.error === 'user not found' ? 404 : 500;
        ctx.response.body = { error: result.error };
        return;
    }

    ctx.status = 200;
    ctx.type = 'application/json';
    ctx.body = [];
    return;
}

export default { 'POST /user_ac_update': user_ac_update };
