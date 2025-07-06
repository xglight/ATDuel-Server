// room_ready.mjs
import pool from '../db.mjs';

async function room_ready(ctx, next) {
    const { room_id, team, position, ready } = ctx.request.body;

    // 参数校验
    if (!room_id || !team || position === undefined || ready === undefined) {
        ctx.status = 400;
        ctx.body = { success: false, error: '参数不完整' };
        return;
    }

    try {
        // 获取房间数据
        const [roomRows] = await pool.query('SELECT * FROM rooms WHERE url = ?', [room_id]);
        if (roomRows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, error: '房间不存在' };
            return;
        }

        const room = roomRows[0];
        let userData;
        try {
            userData = typeof room.user === 'string' ? JSON.parse(room.user) : room.user;
            if (!userData || typeof userData !== 'object') {
                userData = { A: [], B: [] };
            }
            if (!userData.A) userData.A = [];
            if (!userData.B) userData.B = [];
        } catch (e) {
            console.error('解析user数据失败:', e);
            userData = { A: [], B: [] };
        }

        // 查找用户位置
        const userIndex = userData[team].findIndex(u =>
            u.place === position
        );

        if (userIndex === -1) {
            ctx.status = 404;
            ctx.body = { success: false, error: '位置无用户' };
            return;
        }

        // 更新准备状态
        userData[team][userIndex].ready = ready;

        // 更新数据库
        await pool.query(
            'UPDATE rooms SET user = ? WHERE url = ?',
            [JSON.stringify(userData), room_id]
        );

        // 获取更新后的完整房间数据
        const [updatedRoom] = await pool.query(
            'SELECT * FROM rooms WHERE url = ?',
            [room_id]
        );

        // 返回更新后的房间数据
        ctx.body = {
            success: true,
            userData,
            setting: safeParseJSON(room.setting, {}),
            rated: room.rated
        };

        // 广播准备状态更新
        if (updatedRoom.length > 0) {
            ctx.app.emit('broadcast', {
                type: 'room_update',
                roomId: room_id,
                last_updated: updatedRoom[0].last_updated,
                fullUpdate: true
            });
        }
    } catch (err) {
        console.error(err);
        ctx.status = 500;
        ctx.body = { success: false, error: '服务器错误' };
        return;
    }
}

function safeParseJSON(jsonStr, defaultValue = {}) {
    try {
        if (typeof jsonStr === 'string') {
            return JSON.parse(jsonStr);
        } else if (typeof jsonStr === 'object' && jsonStr !== null) {
            return jsonStr;
        }
        return defaultValue;
    } catch (e) {
        console.error('解析JSON失败:', e);
        return defaultValue;
    }
}

export default {
    'POST /room_ready': room_ready
}
