import pool from '../db.mjs';
import logger from '../logger.mjs';
import config from '../config.mjs';

/**
 * 管理员删除房间接口
 * @param {object} ctx Koa 上下文
 * @param {function} next 下一个中间件
 */
async function deleteRoom(ctx, next) {
    const { roomId, token } = ctx.request.body;
    if (!roomId || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'roomId and token are required' };
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
        logger.error(`admin_room_delete: Auth check failed: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '权限校验服务异常' };
        return;
    }

    const conn = await pool.getConnection();
    try {
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
        logger.info(`admin_room_delete: Admin deleted room ${id} (${url})`);

        // 广播房间删除通知
        ctx.app.emit('broadcast', {
            type: 'room_deleted',
            roomId: url,
            message: 'Room deleted by admin'
        });

        ctx.status = 200;
        ctx.body = { success: true, message: '房间已关闭' };
    } catch (err) {
        logger.error(`admin_room_delete: Failed to delete room ${roomId}: ${err.message}`);
        if (conn) await conn.rollback();
        ctx.status = 500;
        ctx.body = { success: false, message: '数据库操作失败' };
    } finally {
        if (conn) conn.release();
    }
}

export default {
    'POST /admin/room_delete': deleteRoom
};
