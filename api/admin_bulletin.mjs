import pool from '../db.mjs';
import logger from '../logger.mjs';
import { verifyAdmin } from '../utils/auth.mjs';

/**
 * 添加公告
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function addBulletin(ctx) {
    const { title, content, token } = ctx.request.body;

    if (!title || !content || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: '标题、内容和 Token 均不能为空' };
        return;
    }

    if (!(await verifyAdmin(token))) {
        ctx.status = 401;
        ctx.body = { success: false, message: '管理员权限校验失败' };
        return;
    }

    try {
        await pool.execute(
            'INSERT INTO bulletin (title, content) VALUES (?, ?)',
            [title, content]
        );
        logger.info(`admin_bulletin: 管理员发布了新公告: ${title}`);
        ctx.status = 200;
        ctx.body = { success: true, message: '公告已发布' };
    } catch (err) {
        logger.error(`admin_bulletin: 发布公告失败: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

/**
 * 删除公告
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function deleteBulletin(ctx) {
    const { id, token } = ctx.request.body;

    if (!id || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'ID 和 Token 均不能为空' };
        return;
    }

    if (!(await verifyAdmin(token))) {
        ctx.status = 401;
        ctx.body = { success: false, message: '管理员权限校验失败' };
        return;
    }

    try {
        const [result] = await pool.execute('DELETE FROM bulletin WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '公告不存在' };
            return;
        }
        logger.info(`admin_bulletin: 管理员删除了公告 ID: ${id}`);
        ctx.status = 200;
        ctx.body = { success: true, message: '公告已删除' };
    } catch (err) {
        logger.error(`admin_bulletin: 删除公告失败: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'POST /admin/bulletin_add': addBulletin,
    'POST /admin/bulletin_delete': deleteBulletin
};
