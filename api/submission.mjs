// submission.mjs

import pool from '../db.mjs';
import logger from '../logger.mjs';

async function submission(ctx, next) {
    const { contestId } = ctx.params;
    const { page = 1, pageSize = 10 } = ctx.query;

    if (!contestId) {
        ctx.status = 400;
        ctx.body = { error: 'Invalid parameters' };
        return;
    }
    const [rows] = await pool.execute('SELECT * FROM contest WHERE url =?', [contestId]);
    if (rows.length == 0) {
        ctx.status = 404;
        ctx.body = { error: 'Contest not found' };
        return;
    }
    logger.info(`submission: Fetching submissions for contest: ${contestId}`);
    try {
        const contest = rows[0];
        const offset = (page - 1) * pageSize;

        // 获取总数
        const [totalRows] = await pool.query('SELECT COUNT(*) as total FROM contest_submissions WHERE contest_id = ?', [contest.id]);
        const total = totalRows[0].total;

        // 获取分页数据
        const [submissions] = await pool.query(
            'SELECT username, task_title as task, status, submission_time as time FROM contest_submissions WHERE contest_id = ? ORDER BY submission_time DESC LIMIT ? OFFSET ?',
            [contest.id, parseInt(pageSize), offset]
        );

        ctx.status = 200;
        ctx.body = { data: submissions, total };
    } catch (err) {
        logger.error(`submission: Failed to fetch submissions: ${err.message}`);
        ctx.status = 500;
        ctx.body = [];
    }
}

export default {
    'GET /submission/:contestId': submission
}
