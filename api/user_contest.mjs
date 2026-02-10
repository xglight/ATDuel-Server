// user_contest.mjs
import pool from '../db.mjs';
import config from '../config.mjs';
import logger from '../logger.mjs';

/**
 * 获取用户的比赛历史接口
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function user_contest(ctx) {
    const { username } = ctx.params;
    if (!username) {
        ctx.status = 400;
        ctx.body = { success: false, message: '用户名不能为空' };
        return;
    }

    logger.info(`user_contest: 正在获取用户 ${username} 的比赛历史`);
    try {
        const [historyRows] = await pool.query('SELECT DISTINCT contest_id FROM contest_participants WHERE username = ?', [username]);
        if (historyRows.length === 0) {
            ctx.status = 200;
            ctx.body = { success: true, data: [] };
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
        ctx.body = { success: true, data: data };
    } catch (err) {
        logger.error(`user_contest: 获取用户 ${username} 的比赛历史失败: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default { 'GET /user_contest/:username': user_contest };