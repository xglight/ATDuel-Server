// room_update_setting.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 修改房间设置接口
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function updateRoomSetting(ctx) {
    const { roomId: roomUrl, username, token, playerCount, difficultyMin, difficultyMax, problemCount, isRated } = ctx.request.body;

    if (!roomUrl || !username || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: '缺少必要参数' };
        return;
    }

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

        // 获取房间信息并加锁
        const [roomRows] = await conn.execute(
            'SELECT id, master FROM room WHERE url = ? FOR UPDATE',
            [roomUrl]
        );

        if (roomRows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '房间不存在' };
            await conn.rollback();
            return;
        }

        const room = roomRows[0];

        // 校验房主权限
        if (room.master !== username) {
            ctx.status = 403;
            ctx.body = { success: false, message: '只有房主可以修改房间设置' };
            await conn.rollback();
            return;
        }

        const now = new Date();
        // 更新设置
        await conn.execute(
            `UPDATE room SET 
                setting_mode = ?, 
                setting_rating_lowest = ?, 
                setting_rating_highest = ?, 
                setting_problem_count = ?, 
                rated = ?, 
                last_updated = ? 
            WHERE id = ?`,
            [
                playerCount,
                difficultyMin,
                difficultyMax,
                problemCount,
                isRated ? 1 : 0,
                now,
                room.id
            ]
        );

        await conn.commit();
        logger.info(`room_update_setting: 房主 ${username} 修改了房间 ${roomUrl} 的设置`);

        // 广播更新通知
        ctx.app.emit('broadcast', {
            type: 'room_update',
            roomId: roomUrl,
            last_updated: now
        });

        ctx.body = {
            success: true,
            message: '房间设置已更新'
        };

    } catch (err) {
        logger.error(`room_update_setting 错误: ${err.message}`);
        if (conn) await conn.rollback();
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    } finally {
        if (conn) conn.release();
    }
}

export default {
    'POST /room_update_setting': updateRoomSetting
};
