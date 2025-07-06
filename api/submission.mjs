// submission.mjs

import pool from '../db.mjs';

async function submission(ctx, next) {
    const { contestId } = ctx.params;
    const { page = 1, pageSize = 10 } = ctx.query;

    if (!contestId) {
        ctx.status = 400;
        ctx.body = { error: '参数错误' };
        return;
    }
    const [rows] = await pool.execute('SELECT * FROM contest WHERE url =?', [contestId]);
    if (rows.length == 0) {
        ctx.status = 404;
        ctx.body = { error: '没有找到该比赛' };
        return;
    }
    try {
        if (rows[0].submission == null) {
            ctx.status = 200;
            ctx.body = { data: [], total: 0 };
            return;
        }

        let submissions = rows[0].submission;
        // 使用Date对象进行更精确的时间比较
        submissions.sort((a, b) => new Date(b.time) - new Date(a.time));

        const total = submissions.length;
        const offset = (page - 1) * pageSize;
        const data = submissions.slice(offset, offset + parseInt(pageSize));

        ctx.status = 200;
        ctx.body = { data, total };
    } catch (err) {
        console.error('解析submission数据失败:', err);
        ctx.status = 500;
        ctx.body = [];
    }
}

export default {
    'GET /submission/:contestId': submission
}
