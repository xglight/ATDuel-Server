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
        const [historyRows] = await pool.query('SELECT DISTINCT contest_id FROM contest_participants WHERE username = ?', [username]);
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
            const [
                [teams],
                [participants],
                [problems],
                [ratings]
            ] = await Promise.all([
                pool.query('SELECT * FROM contest_teams WHERE contest_id = ?', [contest.id]),
                pool.query('SELECT * FROM contest_participants WHERE contest_id = ?', [contest.id]),
                pool.query('SELECT * FROM contest_problems WHERE contest_id = ?', [contest.id]),
                pool.query('SELECT * FROM contest_ratings WHERE contest_id = ?', [contest.id])
            ]);

            const team = { A: [], B: [] };
            teams.forEach(t => {
                if (!team[t.team_label]) team[t.team_label] = [];
                team[t.team_label].push(t.username);
            });

            const userMap = {};
            participants.forEach(p => userMap[p.username] = {
                score: p.score,
                place: p.place,
                avatar: p.avatar
            });

            const ratingMap = {};
            ratings.forEach(r => ratingMap[r.username] = {
                oldRating: r.old_rating,
                newRating: r.new_rating,
                delta: r.delta
            });

            data.push({
                id: contest.id,
                url: contest.url,
                startTime: contest.startTime,
                endTime: contest.endTime,
                scorea: contest.scorea,
                scoreb: contest.scoreb,
                team: team,
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
        ctx.body = { error: 'Internal Server Error' };
        return;
    }
}

export default { 'GET /user_contest/:username': user_contest };