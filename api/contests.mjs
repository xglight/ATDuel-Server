// contests.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';


/**
 * 获取所有比赛列表接口
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function contests(ctx) {
    const page = parseInt(ctx.query.page) || 1;
    const limit = parseInt(ctx.query.limit) || 10;
    const offset = (page - 1) * limit;

    logger.debug(`contests: 正在获取第 ${page} 页比赛列表 (limit: ${limit})`);

    try {
        // 获取总数
        const [countRows] = await pool.execute('SELECT COUNT(*) as total FROM contest');
        const total = countRows[0].total;

        // 获取分页数据，按 ID 倒序排列（新比赛在前）
        const [rows] = await pool.execute(
            'SELECT * FROM contest ORDER BY status ASC, id DESC LIMIT ? OFFSET ?',
            [limit.toString(), offset.toString()]
        );

        if (rows.length === 0) {
            ctx.status = 200;
            ctx.body = { success: true, data: [], total: total };
            return;
        }

        const contestIds = rows.map(r => r.id);

        // 获取当前分页比赛的相关信息
        const [
            allTeams,
            allParticipants,
            allProblems,
            allRatings
        ] = await Promise.all([
            pool.query('SELECT * FROM contest_teams WHERE contest_id IN (?)', [contestIds]).then(r => r[0]),
            pool.query('SELECT * FROM contest_participants WHERE contest_id IN (?)', [contestIds]).then(r => r[0]),
            pool.query('SELECT * FROM contest_problems WHERE contest_id IN (?)', [contestIds]).then(r => r[0]),
            pool.query('SELECT * FROM contest_ratings WHERE contest_id IN (?)', [contestIds]).then(r => r[0])
        ]);

        // 建立映射
        const teamsMap = {};
        allTeams.forEach(t => {
            if (!teamsMap[t.contest_id]) {
                teamsMap[t.contest_id] = { A: [], B: [] };
            }
            if (teamsMap[t.contest_id][t.team_label]) {
                teamsMap[t.contest_id][t.team_label].push(t.username);
            }
        });

        const participantsMap = {};
        allParticipants.forEach(p => {
            if (!participantsMap[p.contest_id]) {
                participantsMap[p.contest_id] = {};
            }
            participantsMap[p.contest_id][p.username] = {
                score: p.score,
                place: p.place,
                avatar: p.avatar
            };
        });

        const problemsMap = {};
        allProblems.forEach(p => {
            if (!problemsMap[p.contest_id]) {
                problemsMap[p.contest_id] = [];
            }
            problemsMap[p.contest_id].push({
                id: p.problem_id,
                title: p.title,
                url: p.url,
                score: p.score,
                status: p.status,
                difficulty: p.difficulty,
                acuser: p.acuser
            });
        });

        const ratingsMap = {};
        allRatings.forEach(r => {
            if (!ratingsMap[r.contest_id]) {
                ratingsMap[r.contest_id] = {};
            }
            ratingsMap[r.contest_id][r.username] = {
                oldRating: r.old_rating,
                newRating: r.new_rating,
                delta: r.delta
            };
        });

        // 直接使用 rows，SQL 已经排好序了
        const result = rows.map(row => ({
            id: row.id,
            url: row.url,
            startTime: row.startTime,
            endTime: row.endTime,
            team: teamsMap[row.id] || { A: [], B: [] },
            user: participantsMap[row.id] || {},
            rating: ratingsMap[row.id] || {},
            problem: problemsMap[row.id] || [],
            scorea: row.scorea,
            scoreb: row.scoreb,
            status: row.status,
            rated: row.rated
        }));

        logger.debug(`contests: 成功获取 ${result.length} 个比赛`);

        ctx.status = 200;
        ctx.body = {
            success: true,
            data: result,
            total: total
        };
    } catch (err) {
        logger.error(`contests 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'GET /contests': contests
}
