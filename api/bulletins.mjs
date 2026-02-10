import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 获取公告列表接口
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function getBulletins(ctx) {
    try {
        const [rows] = await pool.execute(
            'SELECT id, title, content, created_at, updated_at FROM bulletin ORDER BY created_at DESC'
        );
        ctx.status = 200;
        ctx.body = { success: true, data: rows };
    } catch (err) {
        logger.error(`bulletins: 获取公告列表失败: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'GET /bulletins': getBulletins
};
