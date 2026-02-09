// admin_contest_update.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';
import config from '../config.mjs';

/**
 * 更新比赛信息 (管理员权限)
 * @param {object} ctx - Koa context
 */
async function updateContest(ctx, next) {
    const { contestId, token, startTime, endTime, rated, status } = ctx.request.body;

    if (!contestId || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'contestId and token are required' };
        return;
    }

    try {
        // 校验管理员 Token
        const checkRes = await fetch(config.buildApiUrl('/admin/check'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        }).then(res => res.json());

        if (!checkRes.success) {
            ctx.status = 401;
            ctx.body = { success: false, message: '管理员权限校验失败' };
            return;
        }

        // 构建更新语句
        const updates = [];
        const params = [];

        if (startTime !== undefined) {
            updates.push('startTime = ?');
            params.push(startTime || null);
        }
        if (endTime !== undefined) {
            updates.push('endTime = ?');
            params.push(endTime || null);
        }
        if (rated !== undefined) {
            updates.push('rated = ?');
            params.push(rated ? 1 : 0);
        }
        if (status !== undefined) {
            updates.push('status = ?');
            params.push(status);
        }

        if (updates.length === 0) {
            ctx.status = 400;
            ctx.body = { success: false, message: 'No fields to update' };
            return;
        }

        params.push(contestId);
        const query = `UPDATE contest SET ${updates.join(', ')} WHERE url = ?`;

        const [result] = await pool.execute(query, params);

        if (result.affectedRows === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '比赛不存在' };
            return;
        }

        logger.info(`admin_contest_update: Contest ${contestId} updated by admin`);
        ctx.status = 200;
        ctx.body = { success: true, message: '比赛信息已更新' };

    } catch (err) {
        logger.error(`admin_contest_update: Failed to update contest ${contestId}: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '数据库操作失败' };
    }
}

export default {
    'POST /admin/contest_update': updateContest
};
