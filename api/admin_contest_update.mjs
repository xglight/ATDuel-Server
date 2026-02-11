// admin_contest_update.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';
import { verifyAdmin } from '../utils/auth.mjs';

/**
 * 更新比赛信息接口 (管理员权限)
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function updateContest(ctx) {
    const { contestId, startTime, endTime, rated, status } = ctx.request.body;

    if (!contestId) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'contestId 不能为空' };
        return;
    }

    try {
        if (!(await verifyAdmin(ctx))) {
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
            ctx.body = { success: false, message: '没有需要更新的字段' };
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

        logger.info(`admin_contest_update: 管理员更新了比赛 ${contestId}`);
        ctx.status = 200;
        ctx.body = { success: true, message: '比赛信息已更新' };

    } catch (err) {
        logger.error(`admin_contest_update: 更新比赛 ${contestId} 失败: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'POST /admin/contest_update': updateContest
};
