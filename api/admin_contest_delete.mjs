import pool from '../db.mjs';
import logger from '../logger.mjs';
import { verifyAdmin } from '../utils/auth.mjs';

/**
 * 管理员删除比赛接口
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function deleteContest(ctx) {
    const { contestId, token } = ctx.request.body;
    if (!contestId || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'contestId 和 Token 均不能为空' };
        return;
    }

    if (!(await verifyAdmin(token))) {
        ctx.status = 401;
        ctx.body = { success: false, message: '管理员权限校验失败' };
        return;
    }

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        // 检查比赛是否存在
        const [rows] = await conn.execute('SELECT id FROM contest WHERE url = ?', [contestId]);
        if (rows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '比赛不存在' };
            await conn.rollback();
            return;
        }

        const id = rows[0].id;

        // 删除关联数据
        await Promise.all([
            conn.execute('DELETE FROM contest_problems WHERE contest_id = ?', [id]),
            conn.execute('DELETE FROM contest_teams WHERE contest_id = ?', [id]),
            conn.execute('DELETE FROM contest_participants WHERE contest_id = ?', [id]),
            conn.execute('DELETE FROM contest_submissions WHERE contest_id = ?', [id]),
            conn.execute('DELETE FROM contest_ratings WHERE contest_id = ?', [id]),
            conn.execute('DELETE FROM contest_messages WHERE contest_id = ?', [contestId])
        ]);
        
        await conn.execute('DELETE FROM contest WHERE id = ?', [id]);

        await conn.commit();
        logger.info(`admin_contest_delete: 管理员删除了比赛 ${contestId}`);
        ctx.status = 200;
        ctx.body = { success: true, message: '比赛已删除' };
    } catch (err) {
        logger.error(`admin_contest_delete: 删除比赛 ${contestId} 失败: ${err.message}`);
        if (conn) await conn.rollback();
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    } finally {
        if (conn) conn.release();
    }
}

export default {
    'POST /admin/contest_delete': deleteContest
};
