// submission.mjs

import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 获取比赛的提交列表
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function submission(ctx) {
    const { contestId } = ctx.params;
    const { page = 1, pageSize = 10 } = ctx.query;

    if (!contestId) {
        ctx.status = 400;
        ctx.body = { success: false, message: '参数无效' };
        return;
    }

    try {
        // 首先查找比赛
        const [contestRows] = await pool.execute('SELECT id FROM contest WHERE url = ? LIMIT 1', [contestId]);
        if (contestRows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '未找到该比赛' };
            return;
        }

        const contest = contestRows[0];
        const offset = (parseInt(page) - 1) * parseInt(pageSize);
        const limit = parseInt(pageSize);

        logger.info(`submission: 正在获取比赛提交列表: ${contestId}, 页码: ${page}, 每页数量: ${pageSize}`);

        // 并行查询总数和分页数据
        const [totalResult, submissionsResult] = await Promise.all([
            pool.execute('SELECT COUNT(*) as total FROM contest_submissions WHERE contest_id = ?', [contest.id]),
            pool.execute(
                'SELECT username, task_title as task, status, submission_time as time FROM contest_submissions WHERE contest_id = ? ORDER BY submission_time DESC LIMIT ? OFFSET ?',
                [contest.id, limit, offset]
            )
        ]);

        const total = totalResult[0][0].total;
        const submissions = submissionsResult[0];

        ctx.status = 200;
        ctx.body = {
            success: true,
            data: {
                submissions,
                total,
                page: parseInt(page),
                pageSize: limit
            }
        };
    } catch (err) {
        logger.error(`submission 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'GET /submission/:contestId': submission
}
