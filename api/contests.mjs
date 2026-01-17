// contests.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';


async function contests(ctx, next) {
    try {
        const [rows, fields] = await pool.query('SELECT * FROM contest');
        logger.debug(`contests: Fetching all contests: Total ${rows.length} records`);

        if (rows.length === 0) {
            ctx.body = { success: true, contests: [] };
            return;
        }

        // 获取所有比赛的相关信息
        const [allTeams] = await pool.query('SELECT * FROM contest_teams');
        const [allParticipants] = await pool.query('SELECT * FROM contest_participants');
        const [allProblems] = await pool.query('SELECT * FROM contest_problems');
        const [allRatings] = await pool.query('SELECT * FROM contest_ratings');

        const teamsMap = {};
        allTeams.forEach(t => {
            if (!teamsMap[t.contest_id]) teamsMap[t.contest_id] = { A: [], B: [] };
            teamsMap[t.contest_id][t.team_label].push(t.username);
        });

        const participantsMap = {};
        allParticipants.forEach(p => {
            if (!participantsMap[p.contest_id]) participantsMap[p.contest_id] = {};
            participantsMap[p.contest_id][p.username] = {
                score: p.score,
                place: p.place,
                avatar: p.avatar
            };
        });

        const problemsMap = {};
        allProblems.forEach(p => {
            if (!problemsMap[p.contest_id]) problemsMap[p.contest_id] = [];
            problemsMap[p.contest_id].push({
                id: p.problem_id,
                title: p.title,
                url: p.url,
                score: p.score,
                status: p.status,
                difficulty: p.difficulty
            });
        });

        const ratingsMap = {};
        allRatings.forEach(r => {
            if (!ratingsMap[r.contest_id]) ratingsMap[r.contest_id] = {};
            ratingsMap[r.contest_id][r.username] = {
                oldRating: r.old_rating,
                newRating: r.new_rating,
                delta: r.delta
            };
        });

        rows.sort((a, b) => {
            if (a.status < b.status) return -1;
            if (a.status > b.status) return 1;
            return b.id - a.id;
        });

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

        ctx.type = 'text/json';
        ctx.status = 200;
        ctx.body = result;
    } catch (err) {
        logger.error(`contests: Failed to fetch all contests: ${err.message}`);
        ctx.status = 500;
        ctx.type = 'text/plain';
        ctx.body = 'Server Error';
        return;
    }
}

export default {
    'GET /contests': contests
}
