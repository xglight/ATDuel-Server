import pool from '../db.mjs';
import logger from '../logger.mjs';
import { verifyAdmin } from '../utils/auth.mjs';

/**
 * 管理员删除房间接口
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function deleteRoom(ctx) {
    const { roomId } = ctx.request.body;
    if (!roomId) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'roomId 不能为空' };
        return;
    }

    if (!(await verifyAdmin(ctx))) {
        ctx.status = 401;
        ctx.body = { success: false, message: '管理员权限校验失败' };
        return;
    }

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        // 检查房间是否存在
        const [rows] = await conn.execute('SELECT id, url FROM room WHERE id = ? OR url = ?', [roomId, roomId]);
        if (rows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '房间不存在' };
            await conn.rollback();
            return;
        }

        const id = rows[0].id;
        const url = rows[0].url;

        // 删除关联数据
        await conn.execute('DELETE FROM room_participants WHERE room_id = ?', [id]);
        await conn.execute('DELETE FROM room WHERE id = ?', [id]);

        await conn.commit();
        logger.info(`admin_room_delete: 管理员删除了房间 ${id} (${url})`);

        // 广播房间删除通知
        ctx.app.emit('broadcast', {
            type: 'room_deleted',
            roomId: url,
            message: '房间已被管理员关闭'
        });

        ctx.status = 200;
        ctx.body = { success: true, message: '房间已关闭' };
    } catch (err) {
        logger.error(`admin_room_delete: 删除房间 ${roomId} 失败: ${err.message}`);
        if (conn) await conn.rollback();
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    } finally {
        if (conn) conn.release();
    }
}

export default {
    'POST /admin/room_delete': deleteRoom
};
