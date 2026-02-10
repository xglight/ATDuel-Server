// room_delete.mjs

import pool from '../db.mjs';
import logger from '../logger.mjs';


/**
 * 删除房间接口
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function deleteRoom(ctx) {
    const { room_id: roomUrl, username, token } = ctx.request.body;

    if (!roomUrl || !username || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: '房间 URL、用户名和 Token 不能为空' };
        return;
    }

    logger.debug(`room_delete: 正在删除房间, URL: ${roomUrl}, 操作者: ${username}`);

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        // 校验 Token
        const [loginRows] = await conn.execute(
            'SELECT username FROM login_status WHERE username = ? AND token = ?',
            [username, token]
        );

        if (loginRows.length === 0) {
            ctx.status = 401;
            ctx.body = { success: false, message: '未登录或 Token 无效' };
            await conn.rollback();
            return;
        }

        // 获取房间信息
        const [roomRows] = await conn.execute('SELECT id, master FROM room WHERE url = ? FOR UPDATE', [roomUrl]);
        if (roomRows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '未找到该房间' };
            await conn.rollback();
            return;
        }

        const room = roomRows[0];

        // 校验权限：只有房主可以删除房间
        if (room.master !== username) {
            ctx.status = 403;
            ctx.body = { success: false, message: '只有房主可以删除房间' };
            await conn.rollback();
            return;
        }

        // 删除房间成员
        await conn.execute('DELETE FROM room_participants WHERE room_id = ?', [room.id]);

        // 删除房间
        await conn.execute('DELETE FROM room WHERE id = ?', [room.id]);

        await conn.commit();

        logger.info(`room_delete: 房间 ${roomUrl} 已由 ${username} 成功删除`);

        // 广播房间删除通知
        ctx.app.emit('broadcast', {
            type: 'room_deleted',
            roomId: roomUrl,
            message: '房间已删除'
        });

        ctx.body = {
            success: true,
            message: '房间已成功删除'
        };
    } catch (err) {
        logger.error(`room_delete 错误: ${err.message}`);
        if (conn) await conn.rollback();
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    } finally {
        if (conn) conn.release();
    }
}

export default {
    'POST /room_delete': deleteRoom
}