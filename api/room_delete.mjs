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
    logger.debug(`room_delete: Deleting room, Room ID ${room_id}`);

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 先获取房间信息用于广播
        const [roomRows] = await conn.query('SELECT * FROM room WHERE url =?', [room_id]);
        if (roomRows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, error: 'Room does not exist' };
            await conn.rollback();
            return;
        }

        const room = roomRows[0];

        // 删除房间成员
        await conn.execute('DELETE FROM room_participants WHERE room_id =?', [room.id]);
        // 删除房间
        await conn.execute('DELETE FROM room WHERE id =?', [room.id]);
        await conn.commit();

        // 广播房间删除通知
        ctx.app.emit('broadcast', {
            type: 'room_deleted',
            roomId: room_id,
            message: 'Room deleted'
        });

        ctx.body = { success: true };
    } catch (err) {
        logger.error(`room_delete: Failed to delete room: ${err.message}`);
        if (conn) await conn.rollback();
        ctx.status = 500;
        ctx.body = { success: false, error: 'Server Error' };
    } finally {
        if (conn) conn.release();
    }
}

export default {
    'POST /room_delete': delete_room
}