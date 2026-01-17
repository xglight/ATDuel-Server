// room_ready.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';


/**
 * 处理房间准备状态更新
 * @param {object} ctx - Koa 上下文对象
 * @param {function} next - 下一个中间件函数
 */
async function room_ready(ctx, next) {
    const { room_id, team, position, ready } = ctx.request.body;

    // 参数校验
    if (!room_id || !team || position === undefined || ready === undefined) {
        ctx.status = 400;
        ctx.body = { success: false, error: 'Incomplete parameters' };
        return;
    }

    logger.debug(`room_ready: Updating room ready status, Room ID ${room_id}, team ${team}, position ${position}, ready status ${ready}`);

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 获取房间数据并加锁
        const [roomRows] = await conn.query('SELECT * FROM room WHERE url = ? FOR UPDATE', [room_id]);
        if (roomRows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, error: 'Room does not exist' };
            await conn.rollback();
            return;
        }

        const room = roomRows[0];

        // 获取房间成员
        const [participants] = await conn.query(
            `SELECT * FROM room_participants WHERE room_id = ?`,
            [room.id]
        );

        // 构建前端需要的格式
        const teamData = { A: [], B: [] };
        const userData = {};
        participants.forEach(p => {
            teamData[p.team_label].push(p.username);
            userData[p.username] = {
                avatar: p.avatar,
                place: p.place,
                ready: !!p.ready
            };
        });

        // 查找该位置的用户
        const participant = participants.find(p => p.team_label === team && p.place === position);

        if (!participant) {
            ctx.status = 404;
            ctx.body = { success: false, error: 'No user at this position' };
            await conn.rollback();
            return;
        }

        // 更新准备状态
        await conn.query(
            'UPDATE room_participants SET ready = ? WHERE id = ?',
            [ready ? 1 : 0, participant.id]
        );

        // 更新房间更新时间
        await conn.query(
            'UPDATE room SET last_updated = NOW() WHERE id = ?',
            [room.id]
        );

        // 获取更新后的房间信息用于广播
        const [updatedRoom] = await conn.query(
            'SELECT * FROM room WHERE id = ?',
            [room.id]
        );

        await conn.commit();

        // 更新本地副本用于返回
        userData[participant.username].ready = ready;

        // 返回更新后的房间数据
        ctx.body = {
            success: true,
            teamData,
            userData,
            setting: {
                mode: room.setting_mode,
                rating_lowest: room.setting_rating_lowest,
                rating_highest: room.setting_rating_highest,
                problem_count: room.setting_problem_count
            },
            rated: room.rated,
            last_updated: updatedRoom.length > 0 ? updatedRoom[0].last_updated : null
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
        logger.error(`room_ready: Failed to update room ready status: ${err.message}`);
        if (conn) await conn.rollback();
        ctx.status = 500;
        ctx.body = { success: false, error: 'Server Error' };
        return;
    } finally {
        if (conn) conn.release();
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
        logger.error(`room_ready: Failed to parse JSON: ${e.message}`);
        return defaultValue;
    }
}

export default {
    'POST /room_ready': room_ready
}
