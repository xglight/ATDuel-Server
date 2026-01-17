//room_user_update.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

async function room_user_update(ctx, next) {
    const { roomId, op, team, username } = ctx.request.body;
    let pos = ctx.request.body.pos || 0;

    // 参数验证
    if (!roomId || op == null || team == null || !username) {
        ctx.status = 400;
        ctx.body = { success: false, error: 'Incomplete parameters' };
        return;
    }

    logger.debug(`room_user_update: Updating room user, Room ID ${roomId}, operation ${op}, team ${team}, username ${username}, position ${pos}`);

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 获取房间信息和锁
        const [rows] = await conn.query(
            `SELECT * FROM room WHERE url = ? FOR UPDATE`,
            [roomId]
        );

        if (rows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, error: 'Room not found' };
            await conn.rollback();
            return;
        }

        const room = rows[0];
        // 获取房间成员
        const [participants] = await conn.query(
            `SELECT * FROM room_participants WHERE room_id = ?`,
            [room.id]
        );

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

        const setting = {
            mode: room.setting_mode || '1V1',
            rating_lowest: room.setting_rating_lowest,
            rating_highest: room.setting_rating_highest,
            problem_count: room.setting_problem_count
        };

        const mode = setting.mode.split('V');
        const maxTeamA = parseInt(mode[0]) || 1;
        const maxTeamB = parseInt(mode[1]) || 1;

        // 操作处理
        if (op === 0) { // 退出
            await conn.query(
                `DELETE FROM room_participants WHERE room_id = ? AND username = ?`,
                [room.id, username]
            );
            // 更新本地副本用于后续逻辑
            delete userData[username];
            const t = teamData.A.includes(username) ? 'A' : 'B';
            teamData[t] = teamData[t].filter(n => n !== username);
        } else if (op === 1) { // 加入
            // 验证位置有效性
            const teamKey = team === 1 ? 'A' : 'B';
            const maxPos = team === 1 ? maxTeamA : maxTeamB;

            if (pos <= 0 || pos > maxPos) {
                ctx.status = 400;
                ctx.body = { success: false, error: 'Invalid position' };
                await conn.rollback();
                return;
            }

            // 检查是否已在房间中
            const isInRoom = participants.some(p => p.username === username);
            if (isInRoom) {
                ctx.status = 400;
                ctx.body = { success: false, error: 'Please exit the current team first' };
                await conn.rollback();
                return;
            }

            // 检查该位置是否已被占用
            const isPosOccupied = participants.some(p => p.team_label === teamKey && p.place === pos);
            if (isPosOccupied) {
                ctx.status = 400;
                ctx.body = { success: false, error: 'Position already occupied' };
                await conn.rollback();
                return;
            }

            const [userRows] = await conn.query(`SELECT avatar FROM user WHERE username = ?`, [username]);
            const avatar = userRows[0]?.avatar || '';

            await conn.query(
                `INSERT INTO room_participants (room_id, username, team_label, place, avatar, ready) VALUES (?, ?, ?, ?, ?, ?)`,
                [room.id, username, teamKey, pos, avatar, false]
            );

            // 更新本地副本用于返回
            teamData[teamKey].push(username);
            userData[username] = { avatar, place: pos, ready: false };
        }

        // 更新房间更新时间
        await conn.query(
            `UPDATE room SET last_updated = NOW() WHERE id = ?`,
            [room.id]
        );

        // 获取更新后的房间信息
        const [updatedRoom] = await conn.query(
            `SELECT * FROM room WHERE id = ?`,
            [room.id]
        );

        // 提交事务
        await conn.commit();

        // 广播通知
        if (updatedRoom.length > 0) {
            const broadcastMsg = {
                type: 'room_update',
                roomId: roomId,
                last_updated: updatedRoom[0].last_updated,
                fullUpdate: true // 标记需要完全刷新
            };
            ctx.app.emit('broadcast', broadcastMsg);
        }

        ctx.status = 200;
        ctx.body = {
            success: true,
            last_updated: updatedRoom[0].last_updated,
            userData: userData
        };
    } catch (err) {
        logger.error(`room_user_update: Failed to update room user: ${err.message}`);
        if (conn) {
            try {
                await conn.rollback();
            } catch (rollbackErr) {
                logger.error(`room_user_update: Transaction rollback failed: ${rollbackErr.message}`);
            }
            conn.release();
        }
        ctx.status = 500;
        ctx.body = {
            success: false,
            error: 'Internal Server Error',
            detail: process.env.NODE_ENV === 'development' ? err.message : undefined
        };
    } finally {
        if (conn && conn.connection) {
            conn.release();
        }
    }
}

export default {
    'POST /room_user_update': room_user_update
};
