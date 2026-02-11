// admin_check.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';
import { verifyAdmin } from '../utils/auth.mjs';

/**
 * 检查管理员登录状态接口
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function adminCheck(ctx) {
    logger.debug('admin_check: 正在检查管理员登录状态');

    try {
        const isValid = await verifyAdmin(ctx);

        if (isValid) {
            ctx.status = 200;
            ctx.body = { success: true, message: '管理员登录状态有效' };
        } else {
            logger.info('admin_check: 管理员登录状态无效或已过期');
            ctx.status = 401;
            ctx.body = { success: false, message: '未授权，请重新登录' };
        }
    } catch (err) {
        logger.error(`admin_check: 检查管理员登录状态失败: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'POST /admin/check': adminCheck
};
