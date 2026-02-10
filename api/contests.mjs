// contests.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';


/**
 * 获取所有比赛列表接口
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function contests(ctx) {
    logger.debug('contests: 正在获取所有比赛列表');

    try {
        const [rows] = await pool.execute('SELECT * FROM contest');

        if (rows.length === 0) {
            ctx.status = 200;
            ctx.body = { success: true, data: [] };
            return;
        }

        // 获取所有比赛的相关信息
        const [
            [allTeams],
            [allParticipants],
            [allProblems],
            [allRatings]
        ] = await Promise.all([
            pool.execute('SELECT * FROM contest_teams'),
            pool.execute('SELECT * FROM contest_participants'),
            pool.execute('SELECT * FROM contest_problems'),
            pool.execute('SELECT * FROM contest_ratings')
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

        // 排序规则：进行中优先，其次按 ID 倒序
        const sortedRows = [...rows].sort((a, b) => {
            if (a.status !== b.status) {
                return a.status - b.status;
            }
            return b.id - a.id;
        });

        const result = sortedRows.map(row => ({
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

        logger.info(`contests: 成功获取 ${result.length} 个比赛`);

        ctx.status = 200;
        ctx.body = {
            success: true,
            data: result
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
