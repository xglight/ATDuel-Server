// contest.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';


/**
 * 获取单个比赛详情接口
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function contest(ctx) {
    const { id: contestUrl } = ctx.params;

    if (!contestUrl) {
        ctx.status = 400;
        ctx.body = { success: false, message: '比赛 URL 不能为空' };
        return;
    }

    logger.debug(`contest: 正在获取比赛详情: ${contestUrl}`);

    try {
        const [rows] = await pool.execute('SELECT * FROM contest WHERE url = ? LIMIT 1', [contestUrl]);

        if (rows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '未找到该比赛' };
            return;
        }

        const contestData = rows[0];
        const contestId = contestData.id;

        // 并行查询所有关联表
        const [
            [teams],
            [participants],
            [problems],
            [submissions],
            [ratings]
        ] = await Promise.all([
            pool.execute('SELECT * FROM contest_teams WHERE contest_id = ?', [contestId]),
            pool.execute('SELECT * FROM contest_participants WHERE contest_id = ?', [contestId]),
            pool.execute('SELECT * FROM contest_problems WHERE contest_id = ?', [contestId]),
            pool.execute('SELECT * FROM contest_submissions WHERE contest_id = ?', [contestId]),
            pool.execute('SELECT * FROM contest_ratings WHERE contest_id = ?', [contestId])
        ]);

        // 格式化为前端需要的 JSON 结构
        const team = { A: [], B: [] };
        teams.forEach(t => {
            if (team[t.team_label]) {
                team[t.team_label].push(t.username);
            }
        });

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
            difficulty: p.difficulty,
            acuser: p.acuser
        }));

        const submission = submissions.map(s => ({
            task: s.task_title,
            username: s.username,
            status: s.status,
            time: s.submission_time
        }));

        const rating = {};
        ratings.forEach(r => {
            rating[r.username] = {
                oldRating: r.old_rating,
                newRating: r.new_rating,
                delta: r.delta
            };
        });

        const result = {
            ...contestData,
            team,
            user,
            problem,
            submission,
            rating
        };

        ctx.status = 200;
        ctx.body = {
            success: true,
            data: result
        };
    } catch (err) {
        logger.error(`contest 错误: 无法获取比赛 ${contestUrl}: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'GET /contest/:id': contest
}
