//room_user_update.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

async function room_user_update(ctx, next) {
    const { roomId, op, team, username } = ctx.request.body;
    let pos = ctx.request.body.pos || 0;

    // 参数验证
    if (!roomId || op == null || team == null || !username) {
        ctx.status = 400;
        ctx.body = { success: false, error: '参数不完整' };
        return;
    }

    logger.debug(`room_user_update: 更新房间用户, 房间 ID ${roomId}, 操作 ${op}, 队伍 ${team}, 用户名 ${username}, 位置 ${pos}`);

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
            ctx.body = { success: false, error: '房间不存在' };
            await conn.rollback();
            return;
        }

        const room = rows[0];
        let teamData = typeof room.team === 'string' ? JSON.parse(room.team) : (room.team || { A: [], B: [] });
        let userData = typeof room.user === 'string' ? JSON.parse(room.user) : (room.user || {});

        // 处理setting字段
        let setting = {};
        try {
            setting = typeof room.setting === 'string'
                ? JSON.parse(room.setting)
                : room.setting || {};
        } catch (e) {
            logger.error(`room_user_update: 解析setting失败: ${room.setting}, ${e.message}`);
            setting = {};
        }

        // 设置默认模式为1v1
        if (!setting.mode || !setting.mode.includes('V')) {
            setting.mode = '1V1';
            logger.warn('room_user_update: 使用默认房间模式: 1V1');
        }

        const mode = setting.mode.split('V');
        const maxTeamA = parseInt(mode[0]) || 1;
        const maxTeamB = parseInt(mode[1]) || 1;

        // 操作处理
        if (op === 0) { // 退出
            // 从队伍中移除用户
            const originalTeam = teamData.A.includes(username) ? 'A' :
                teamData.B.includes(username) ? 'B' : null;

            if (originalTeam) {
                teamData[originalTeam] = teamData[originalTeam].filter(name => name !== username);
                delete userData[username];
            }
        } else if (op === 1) { // 加入
            // 验证位置有效性
            const teamKey = team === 1 ? 'A' : 'B';
            const maxPos = team === 1 ? maxTeamA : maxTeamB;

            if (pos <= 0 || pos > maxPos) {
                ctx.status = 400;
                ctx.body = { success: false, error: '无效的位置' };
                await conn.rollback();
                return;
            }

            // 检查是否已在其他位置
            const isInOtherTeam = teamData.A.includes(username) || teamData.B.includes(username);
            if (isInOtherTeam) {
                ctx.status = 400;
                ctx.body = { success: false, error: '请先退出当前队伍' };
                await conn.rollback();
                return;
            }

            // 检查该位置是否已被占用
            const isPosOccupied = Object.values(userData).some(u => u.place === pos && teamData[teamKey].includes(Object.keys(userData).find(key => userData[key] === u)));
            // 修正检查：直接遍历 teamData[teamKey] 找到对应的 user
            const occupiedBy = teamData[teamKey].find(name => userData[name] && userData[name].place === pos);
            if (occupiedBy) {
                ctx.status = 400;
                ctx.body = { success: false, error: '该位置已被占用' };
                await conn.rollback();
                return;
            }

            const [userRows] = await conn.query(`SELECT avatar FROM user WHERE username = ?`, [username]);
            const avatar = userRows[0]?.avatar || '';

            teamData[teamKey].push(username);
            userData[username] = {
                avatar: avatar,
                place: pos,
                ready: false
            };
        }

        // 更新数据库
        await conn.query(
            `UPDATE room SET team = ?, user = ?, last_updated = NOW() WHERE url = ?`,
            [JSON.stringify(teamData), JSON.stringify(userData), roomId]
        );

        // 获取更新后的房间信息
        const [updatedRoom] = await conn.query(
            `SELECT * FROM room WHERE url = ?`,
            [roomId]
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
        logger.error(`room_user_update: 更新房间用户失败: ${err.message}`);
        if (conn) {
            try {
                await conn.rollback();
            } catch (rollbackErr) {
                logger.error(`room_user_update: 事务回滚失败: ${rollbackErr.message}`);
            }
            conn.release();
        }
        ctx.status = 500;
        ctx.body = {
            success: false,
            error: '服务器内部错误',
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
