// contest.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';


async function contest(ctx, next) {
    const id = ctx.params.id;
    try {
        const [rows, fields] = await pool.query(`SELECT * FROM contest WHERE url = ?`, [id]);

        if (rows.length === 0) {
            ctx.status = 404;
            ctx.type = 'text/plain';
            ctx.body = 'Contest does not exist';
            return;
        }

        logger.debug(`contest: Fetching contest: Contest ID ${id}`);

        const contest = rows[0];
        const contestId = contest.id;

        // 并行查询所有关联表
        const [
            [teams],
            [participants],
            [problems],
            [submissions],
            [ratings]
        ] = await Promise.all([
            pool.query('SELECT * FROM contest_teams WHERE contest_id = ?', [contestId]),
            pool.query('SELECT * FROM contest_participants WHERE contest_id = ?', [contestId]),
            pool.query('SELECT * FROM contest_problems WHERE contest_id = ?', [contestId]),
            pool.query('SELECT * FROM contest_submissions WHERE contest_id = ?', [contestId]),
            pool.query('SELECT * FROM contest_ratings WHERE contest_id = ?', [contestId])
        ]);

        // 格式化为前端需要的 JSON 结构
        const team = { A: [], B: [] };
        teams.forEach(t => team[t.team_label].push(t.username));

        const user = {};
        participants.forEach(p => {
            user[p.username] = {
                score: p.score,
                place: p.place,
                avatar: p.avatar
            };
        });

        const problem = problems.map(p => ({
            id: p.problem_id,
            title: p.title,
            url: p.url,
            score: p.score,
            status: p.status,
            difficulty: p.difficulty
        }));

        const submission = submissions.map(s => ({
            task: s.task_title,
            username: s.username,
            status: s.status,
            time: s.submission_time
        }));

        const Rating = {};
        ratings.forEach(r => {
            Rating[r.username] = {
                oldRating: r.old_rating,
                newRating: r.new_rating,
                delta: r.delta
            };
        });

        const result = {
            ...contest,
            team,
            user,
            problem,
            submission,
            Rating
        };

        ctx.type = 'text/json';
        ctx.status = 200;
        ctx.body = JSON.stringify(result);
    } catch (err) {
        logger.error(`contest: Failed to fetch contest: ${err.message}`);
        ctx.status = 500;
        ctx.type = 'text/plain';
        ctx.body = 'Server Error';
        return;
    }
}

export default {
    'GET /contest/:id': contest
}
