import pool from '../db.mjs';
import logger from '../logger.mjs';
import config from '../config.mjs';

/**
 * 管理员清空已结束比赛接口
 * @param {object} ctx Koa 上下文
 * @param {function} next 下一个中间件
 */
async function clearContests(ctx, next) {
    const { token } = ctx.request.body;
    if (!token) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'token is required' };
        return;
    }

    // 校验管理员 Token
    try {
        const res = await fetch(config.buildApiUrl('/admin/check'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token: token }),
        }).then(res => res.json());

        if (!res.success) {
            ctx.status = 401;
            ctx.body = { success: false, message: '管理员权限校验失败' };
            return;
        }
    } catch (err) {
        logger.error(`admin_contest_clear: Auth check failed: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '权限校验服务异常' };
        return;
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 获取所有已结束的比赛 (status = 2)
        const [contests] = await conn.execute('SELECT id, url FROM contest WHERE status = 2');

        if (contests.length === 0) {
            ctx.status = 200;
            ctx.body = { success: true, message: '没有需要清空的已结束比赛' };
            await conn.rollback();
            return;
        }

        const contestIds = contests.map(c => c.id);
        const contestUrls = contests.map(c => c.url);

        // 批量删除关联数据
        // 注意：MySQL DELETE ... IN (...) 有性能考虑，但对于管理后台操作通常可以接受
        const idPlaceholders = contestIds.map(() => '?').join(',');
        const urlPlaceholders = contestUrls.map(() => '?').join(',');

        await conn.execute(`DELETE FROM contest_problems WHERE contest_id IN (${idPlaceholders})`, contestIds);
        await conn.execute(`DELETE FROM contest_teams WHERE contest_id IN (${idPlaceholders})`, contestIds);
        await conn.execute(`DELETE FROM contest_participants WHERE contest_id IN (${idPlaceholders})`, contestIds);
        await conn.execute(`DELETE FROM contest_submissions WHERE contest_id IN (${idPlaceholders})`, contestIds);
        await conn.execute(`DELETE FROM contest_ratings WHERE contest_id IN (${idPlaceholders})`, contestIds);
        await conn.execute(`DELETE FROM contest_messages WHERE contest_id IN (${urlPlaceholders})`, contestUrls);
        await conn.execute(`DELETE FROM contest WHERE id IN (${idPlaceholders})`, contestIds);

        await conn.commit();
        logger.info(`admin_contest_clear: Admin cleared ${contests.length} finished contests`);

        ctx.status = 200;
        ctx.body = { success: true, message: `成功清空 ${contests.length} 场已结束比赛` };
    } catch (err) {
        logger.error(`admin_contest_clear: Failed to clear contests: ${err.message}`);
        if (conn) await conn.rollback();
        ctx.status = 500;
        ctx.body = { success: false, message: '数据库操作失败' };
    } finally {
        if (conn) conn.release();
    }
}

export default {
    'POST /admin/contest_clear': clearContests
};
