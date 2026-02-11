import pool from '../db.mjs';
import logger from '../logger.mjs';
import { verifyAdmin } from '../utils/auth.mjs';

/**
 * 管理员清空所有房间接口
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function clearRooms(ctx) {
    try {
        if (!(await verifyAdmin(ctx))) {
            ctx.status = 401;
            ctx.body = { success: false, message: '管理员权限校验失败' };
            return;
        }

    let conn;
    try {
        conn = await pool.getConnection();
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
        logger.info(`admin_room_clear: 管理员清空了 ${rooms.length} 个房间`);

        // 广播房间清空通知
        for (const url of roomUrls) {
            ctx.app.emit('broadcast', {
                type: 'room_deleted',
                roomId: url,
                message: '房间已被管理员清空'
            });
        }
        
        ctx.status = 200;
        ctx.body = { success: true, message: `成功清空 ${rooms.length} 个房间` };
    } catch (err) {
        logger.error(`admin_room_clear: 清空房间失败: ${err.message}`);
        if (conn) await conn.rollback();
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    } finally {
        if (conn) conn.release();
    }
} catch (err) {
    logger.error(`admin_room_clear: 外部错误: ${err.message}`);
    ctx.status = 500;
    ctx.body = { success: false, message: '服务器内部错误' };
}
}

export default {
    'POST /admin/room_clear': clearRooms
};
