//room_user_update.mjs
import pool from '../db.mjs';

async function room_user_update(ctx, next) {
    const { roomId, op, team, username } = ctx.request.body;
    let pos = ctx.request.body.pos || 0;

    // 参数验证
    if (!roomId || op == null || team == null || !username) {
        ctx.status = 400;
        ctx.body = { success: false, error: '参数不完整' };
        return;
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 获取房间信息和锁
        const [rows] = await conn.query(
            `SELECT * FROM rooms WHERE url = ? FOR UPDATE`,
            [roomId]
        );

        if (rows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, error: '房间不存在' };
            await conn.rollback();
            return;
        }

        const room = rows[0];
        let userData = room.user || { A: [], B: [] };

        // 处理setting字段
        let setting = {};
        try {
            setting = typeof room.setting === 'string'
                ? JSON.parse(room.setting)
                : room.setting || {};
        } catch (e) {
            console.error('解析setting失败:', room.setting, e);
            setting = {};
        }

        // 设置默认模式为1v1
        if (!setting.mode || !setting.mode.includes('V')) {
            setting.mode = '1V1';
            console.warn('使用默认房间模式: 1V1');
        }

        const mode = setting.mode.split('V');
        const maxTeamA = parseInt(mode[0]) || 1;
        const maxTeamB = parseInt(mode[1]) || 1;

        // 操作处理
        if (op === 0) { // 退出
            // 从队伍中移除用户
            const originalTeam = userData.A.some(u => u.name === username) ? 'A' :
                userData.B.some(u => u.name === username) ? 'B' : null;

            if (originalTeam) {
                userData[originalTeam] = userData[originalTeam].filter(u => u.name !== username);
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
            const isInOtherTeam = userData.A.some(u => u.name === username) ||
                userData.B.some(u => u.name === username);
            if (isInOtherTeam) {
                ctx.status = 400;
                ctx.body = { success: false, error: '请先退出当前队伍' };
                await conn.rollback();
                return;
            }

            const [avator] = await conn.query(`SELECT * FROM user WHERE username = ?`, [username]);

            userData[teamKey].splice(pos, 0, { avator: avator[0].avator, name: username, place: pos, ready: false, score: 0 });
            // 确保不超过最大人数
            userData[teamKey] = userData[teamKey].slice(0, maxPos);
        }

        // 更新数据库
        await conn.query(
            `UPDATE rooms SET user = ?, last_updated = NOW() WHERE url = ?`,
            [JSON.stringify(userData), roomId]
        );

        // 获取更新后的房间信息
        const [updatedRoom] = await conn.query(
            `SELECT * FROM rooms WHERE url = ?`,
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
        console.log(err);
        if (conn) {
            try {
                await conn.rollback();
            } catch (rollbackErr) {
                console.error('事务回滚失败:', rollbackErr);
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
