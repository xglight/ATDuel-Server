// admin_check.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';
import { verifyAdmin } from '../utils/auth.mjs';

/**
 * 管理员登录状态校验接口
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function checkAdminLogin(ctx) {
    const { token } = ctx.request.body;

    if (!token) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'Token 不能为空' };
        return;
    }
    logger.debug(`admin_check: 管理员登录检查: ${token}`);

    try {
        if (await verifyAdmin(token)) {
            ctx.status = 200;
            ctx.body = { success: true, message: '登录状态有效' };
        } else {
            ctx.status = 401;
            ctx.body = { success: false, message: '管理员未登录或已过期' };
        }
    } catch (error) {
        logger.error(`admin_check: 查询错误: ${error.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'POST /admin/check': checkAdminLogin
};
