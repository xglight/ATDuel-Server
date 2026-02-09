import pool from '../db.mjs';
import logger from '../logger.mjs';
import config from '../config.mjs';

/**
 * 管理员删除比赛接口
 * @param {object} ctx Koa 上下文
 * @param {function} next 下一个中间件
 */
async function deleteContest(ctx, next) {
    const { contestId, token } = ctx.request.body;
    if (!contestId || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'contestId and token are required' };
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
        logger.error(`admin_contest_delete: Auth check failed: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '权限校验服务异常' };
        return;
    }

    const conn = await pool.getConnection();
    try {
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
        await conn.execute('DELETE FROM contest_problems WHERE contest_id = ?', [id]);
        await conn.execute('DELETE FROM contest_teams WHERE contest_id = ?', [id]);
        await conn.execute('DELETE FROM contest_participants WHERE contest_id = ?', [id]);
        await conn.execute('DELETE FROM contest_submissions WHERE contest_id = ?', [id]);
        await conn.execute('DELETE FROM contest_ratings WHERE contest_id = ?', [id]);
        await conn.execute('DELETE FROM contest_messages WHERE contest_id = ?', [contestId]);
        await conn.execute('DELETE FROM contest WHERE id = ?', [id]);

        await conn.commit();
        logger.info(`admin_contest_delete: Admin deleted contest ${contestId}`);
        ctx.status = 200;
        ctx.body = { success: true, message: '比赛已删除' };
    } catch (err) {
        logger.error(`admin_contest_delete: Failed to delete contest ${contestId}: ${err.message}`);
        if (conn) await conn.rollback();
        ctx.status = 500;
        ctx.body = { success: false, message: '数据库操作失败' };
    } finally {
        if (conn) conn.release();
    }
}

export default {
    'POST /admin/contest_delete': deleteContest
};
