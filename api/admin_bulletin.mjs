import pool from '../db.mjs';
import logger from '../logger.mjs';
import config from '../config.mjs';

/**
 * 校验管理员权限
 * @param {string} token 管理员 Token
 * @returns {Promise<boolean>} 是否校验通过
 */
async function verifyAdmin(token) {
    if (!token) return false;
    try {
        const response = await fetch(config.buildApiUrl('/admin/check'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const res = await response.json();
        return res.success;
    } catch (err) {
        logger.error(`admin_bulletin: Auth check failed: ${err.message}`);
        return false;
    }
}

/**
 * 添加公告
 * @param {object} ctx Koa 上下文
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
        logger.info(`admin_bulletin: Admin added new bulletin: ${title}`);
        ctx.status = 200;
        ctx.body = { success: true, message: '公告已发布' };
    } catch (err) {
        logger.error(`admin_bulletin: Failed to add bulletin: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '数据库操作失败' };
    }
}

/**
 * 删除公告
 * @param {object} ctx Koa 上下文
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
        logger.info(`admin_bulletin: Admin deleted bulletin ID: ${id}`);
        ctx.status = 200;
        ctx.body = { success: true, message: '公告已删除' };
    } catch (err) {
        logger.error(`admin_bulletin: Failed to delete bulletin: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '数据库操作失败' };
    }
}

export default {
    'POST /admin/bulletin_add': addBulletin,
    'POST /admin/bulletin_delete': deleteBulletin
};
