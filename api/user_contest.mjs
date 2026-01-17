// user_contest.mjs
import pool from '../db.mjs';
import config from '../config.mjs';
import logger from '../logger.mjs';

async function user_contest(ctx, next) {
    const username = ctx.params.username;
    if (!username) {
        ctx.status = 400;
        ctx.body = { error: 'username is required' };
        return;
    }

    logger.info(`user_contest: Fetching contest history for user ${username}`);
    try {
        const [historyRows] = await pool.query('SELECT contest_id FROM user_contest_history WHERE username = ?', [username]);
        if (historyRows.length === 0) {
            ctx.status = 200;
            ctx.type = 'application/json';
            ctx.body = [];
            return;
        }

        const contestIds = historyRows.map(r => r.contest_id);
        const [contests] = await pool.query('SELECT * FROM contest WHERE id IN (?) ORDER BY startTime DESC', [contestIds]);

        const data = [];
        for (const contest of contests) {
            // 获取比赛关联数据
            const [participants] = await pool.query('SELECT * FROM contest_participants WHERE contest_id = ?', [contest.id]);
            const [problems] = await pool.query('SELECT * FROM contest_problems WHERE contest_id = ?', [contest.id]);
            const [ratings] = await pool.query('SELECT * FROM contest_ratings WHERE contest_id = ?', [contest.id]);

            const userMap = {};
            participants.forEach(p => userMap[p.username] = p);

            const ratingMap = {};
            ratings.forEach(r => ratingMap[r.username] = {
                oldRating: r.old_rating,
                newRating: r.new_rating,
                delta: r.delta
            });

            data.push({
                id: contest.id,
                startTime: contest.startTime,
                endTime: contest.endTime,
                user: userMap,
                rating: ratingMap,
                problem: problems,
                status: contest.status
            });
        }

        ctx.status = 200;
        ctx.type = 'application/json';
        ctx.body = data;
    } catch (err) {
        logger.error(`user_contest: Failed to fetch contest history for user ${username}: ${err.message}`);
        ctx.status = 500;
        ctx.type = 'text/plain';
        ctx.body = 'Server Error';
        return;
    }
}

export default { 'GET /user_contest/:username': user_contest };