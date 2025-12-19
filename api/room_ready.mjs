// room_ready.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';


async function room_ready(ctx, next) {
    const { room_id, team, position, ready } = ctx.request.body;

    // 参数校验
    if (!room_id || !team || position === undefined || ready === undefined) {
        ctx.status = 400;
        ctx.body = { success: false, error: '参数不完整' };
        return;
    }

    logger.debug(`room_ready: 更新房间准备状态, 房间 ID ${room_id}, 队伍 ${team}, 位置 ${position}, 准备状态 ${ready}`);

    try {
        // 获取房间数据
        const [roomRows] = await pool.query('SELECT * FROM room WHERE url = ?', [room_id]);
        if (roomRows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, error: '房间不存在' };
            return;
        }

        const room = roomRows[0];
        let teamData;
        let userData;
        try {
            teamData = typeof room.team === 'string' ? JSON.parse(room.team) : room.team;
            userData = typeof room.user === 'string' ? JSON.parse(room.user) : room.user;
            if (!teamData || typeof teamData !== 'object') {
                teamData = { A: [], B: [] };
            }
            if (!userData || typeof userData !== 'object') {
                userData = {};
            }
        } catch (e) {
            logger.error(`room_ready: 解析数据失败: ${e.message}`);
            teamData = { A: [], B: [] };
            userData = {};
        }

        // 查找该位置的用户
        let username;
        if (teamData && teamData[team]) {
            username = teamData[team].find(name => userData[name] && userData[name].place === position);
        }

        if (!username) {
            ctx.status = 404;
            ctx.body = { success: false, error: '位置无用户' };
            return;
        }

        // 更新准备状态 (新版结构)
        if (userData[username] && !Array.isArray(userData[username])) {
            userData[username].ready = ready;
        }

        // 更新数据库
        await pool.query(
            'UPDATE room SET user = ? WHERE url = ?',
            [JSON.stringify(userData), room_id]
        );

        // 获取更新后的完整房间数据
        const [updatedRoom] = await pool.query(
            'SELECT * FROM room WHERE url = ?',
            [room_id]
        );

        // 返回更新后的房间数据
        ctx.body = {
            success: true,
            teamData,
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
        logger.error(`room_ready: 更新房间准备状态失败: ${err.message}`);
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
        logger.error(`room_ready: 解析JSON失败: ${e.message}`);
        return defaultValue;
    }
}

export default {
    'POST /room_ready': room_ready
}
