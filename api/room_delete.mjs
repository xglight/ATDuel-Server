// room_delete.mjs

import pool from '../db.mjs';
import logger from '../logger.mjs';


async function delete_room(ctx, next) {
    const { room_id } = ctx.request.body;

    if (!room_id) {
        ctx.status = 400;
        ctx.body = { success: false, error: 'room_id is required' };
        return;
    }
    logger.debug(`room_delete: 删除房间, 房间 ID ${room_id}`);

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 先获取房间信息用于广播
        const [roomRows] = await conn.query('SELECT * FROM  WHERE url =?', [room_id]);
        if (roomRows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, error: '房间不存在' };
            await conn.rollback();
            return;
        }

        // 删除房间
        await conn.execute('DELETE FROM room WHERE url =?', [room_id]);
        await conn.commit();

        // 广播房间删除通知
        ctx.app.emit('broadcast', {
            type: 'room_deleted',
            roomId: room_id,
            message: '房间已删除'
        });

        ctx.body = { success: true };
    } catch (err) {
        logger.error(`room_delete: 删除房间失败: ${err.message}`);
        if (conn) await conn.rollback();
        ctx.status = 500;
        ctx.body = { success: false, error: '服务器错误' };
    } finally {
        if (conn) conn.release();
    }
}

export default {
    'POST /room_delete': delete_room
}