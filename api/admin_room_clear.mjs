import pool from '../db.mjs';
import logger from '../logger.mjs';
import config from '../config.mjs';

/**
 * 管理员清空所有房间接口
 * @param {object} ctx Koa 上下文
 * @param {function} next 下一个中间件
 */
async function clearRooms(ctx, next) {
    const { token } = ctx.request.body;
    if (!token) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'token is required' };
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
        logger.error(`admin_room_clear: Auth check failed: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '权限校验服务异常' };
        return;
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 获取所有房间 ID
        const [rooms] = await conn.execute('SELECT id, url FROM room');
        
        if (rooms.length === 0) {
            ctx.status = 200;
            ctx.body = { success: true, message: '没有需要清空的房间' };
            await conn.rollback();
            return;
        }

        const roomIds = rooms.map(r => r.id);
        const roomUrls = rooms.map(r => r.url);
        const idPlaceholders = roomIds.map(() => '?').join(',');

        // 批量删除关联数据
        await conn.execute(`DELETE FROM room_participants WHERE room_id IN (${idPlaceholders})`, roomIds);
        await conn.execute(`DELETE FROM room WHERE id IN (${idPlaceholders})`, roomIds);

        await conn.commit();
        logger.info(`admin_room_clear: Admin cleared ${rooms.length} rooms`);

        // 广播房间清空通知 (可选)
        for (const url of roomUrls) {
            ctx.app.emit('broadcast', {
                type: 'room_deleted',
                roomId: url,
                message: 'Room cleared by admin'
            });
        }
        
        ctx.status = 200;
        ctx.body = { success: true, message: `成功清空 ${rooms.length} 个房间` };
    } catch (err) {
        logger.error(`admin_room_clear: Failed to clear rooms: ${err.message}`);
        if (conn) await conn.rollback();
        ctx.status = 500;
        ctx.body = { success: false, message: '数据库操作失败' };
    } finally {
        if (conn) conn.release();
    }
}

export default {
    'POST /admin/room_clear': clearRooms
};
