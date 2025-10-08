// contests.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';


async function contests(ctx, next) {
    try {
        const [rows, fields] = await pool.query('SELECT * FROM contest');
        logger.debug(`contests: 查询所有比赛: 共 ${rows.length} 条记录`);
        rows.sort((a, b) => {
            if (a.status < b.status) {
                return -1;
            } else if (a.status > b.status) {
                return 1;
            } else {
                return b.id - a.id;
            }
        });

        let result = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const id = row.id;
            const url = row.url;
            const starttime = row.startTime;
            const endtime = row.endTime;
            const user = row.user;
            const rating = row.Rating;
            const problem = row.problem;
            const status = row.status;
            const rated = row.rated;
            const scorea = row.scorea;
            const scoreb = row.scoreb;
            result.push({
                id: id,
                url: url,
                startTime: starttime,
                endTime: endtime,
                user,
                rating,
                problem,
                scorea: scorea,
                scoreb: scoreb,
                status: status,
                rated: rated
            });
        }
        try {
            result = JSON.stringify(result);
        } catch (e) { logger.error(`contests: 解析 JSON 失败: ${e.message}`) }
        ctx.type = 'text/json';
        ctx.status = 200;
        ctx.body = result;
    } catch (err) {
        logger.error(`contests: 查询所有比赛失败: ${err.message}`);
        ctx.status = 500;
        ctx.type = 'text/plain';
        ctx.body = 'Server Error';
        return;
    }
}

export default {
    'GET /contests': contests
}
