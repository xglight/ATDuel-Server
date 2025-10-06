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
            ctx.body = '比赛不存在';
            return;
        }

        logger.debug(`contest: 查询比赛: 比赛 ID ${id}`);

        let result;

        try {
            result = JSON.stringify(rows[0]);
        } catch (e) { logger.error(`contest: 解析 JSON 失败: ${e.message}`) }
        ctx.type = 'text/json';
        ctx.status = 200;
        ctx.body = result;
    } catch (err) {
        logger.error(`contest: 查询比赛失败: ${err.message}`);
        ctx.status = 500;
        ctx.type = 'text/plain';
        ctx.body = 'Server Error';
        return;
    }
}

export default {
    'GET /contest/:id': contest
}
