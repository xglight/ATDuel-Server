import pool from '../db.mjs';
import logger from '../logger.mjs';
import { verifyAdmin } from '../utils/auth.mjs';

/**
 * 管理员清空已结束比赛接口
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function clearContests(ctx) {
    try {
        if (!(await verifyAdmin(ctx))) {
            ctx.status = 401;
            ctx.body = { success: false, message: '管理员权限校验失败' };
            return;
        }

        let conn;
        try {
            conn = await pool.getConnection();
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
            const idPlaceholders = contestIds.map(() => '?').join(',');
            const urlPlaceholders = contestUrls.map(() => '?').join(',');

            await Promise.all([
                conn.execute(`DELETE FROM contest_problems WHERE contest_id IN (${idPlaceholders})`, contestIds),
                conn.execute(`DELETE FROM contest_teams WHERE contest_id IN (${idPlaceholders})`, contestIds),
                conn.execute(`DELETE FROM contest_participants WHERE contest_id IN (${idPlaceholders})`, contestIds),
                conn.execute(`DELETE FROM contest_submissions WHERE contest_id IN (${idPlaceholders})`, contestIds),
                conn.execute(`DELETE FROM contest_ratings WHERE contest_id IN (${idPlaceholders})`, contestIds),
                conn.execute(`DELETE FROM contest_messages WHERE contest_id IN (${urlPlaceholders})`, contestUrls)
            ]);

            await conn.execute(`DELETE FROM contest WHERE id IN (${idPlaceholders})`, contestIds);

            await conn.commit();
            logger.info(`admin_contest_clear: 管理员清空了 ${contests.length} 场已结束比赛`);

            ctx.status = 200;
            ctx.body = { success: true, message: `成功清空 ${contests.length} 场已结束比赛` };
        } catch (err) {
            logger.error(`admin_contest_clear: 清空比赛失败: ${err.message}`);
            ctx.status = 500;
            ctx.body = { success: false, message: '服务器内部错误' };
        } finally {
            if (conn) conn.release();
        }
    } catch (err) {
        logger.error(`admin_contest_clear: 外部错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'POST /admin/contest_clear': clearContests
};
