//room_user_update.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 更新房间成员接口 (加入/退出)
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function updateRoomUser(ctx) {
    const { roomId: roomUrl, op: operation, team: targetTeam, username, token } = ctx.request.body;
    const position = ctx.request.body.pos || 0;

    // 参数验证
    if (!roomUrl || operation === undefined || targetTeam === undefined || !username || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: '缺少必要参数' };
        return;
    }

    logger.debug(`room_user_update: 正在更新成员信息, 用户: ${username}, 房间: ${roomUrl}, 操作: ${operation}, 队伍: ${targetTeam}, 位置: ${position}`);

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

        // 获取房间信息和锁
        const [rows] = await conn.execute('SELECT id, setting_mode, setting_rating_lowest, setting_rating_highest, setting_problem_count FROM room WHERE url = ? FOR UPDATE', [roomUrl]);
        if (rows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '未找到该房间' };
            await conn.rollback();
            return;
        }

        const roomData = rows[0];

        // 获取房间成员
        const [participants] = await conn.execute(
            'SELECT username, team_label, avatar, place, ready FROM room_participants WHERE room_id = ?',
            [roomData.id]
        );

        const currentTeams = { A: [], B: [] };
        const userMap = {};
        participants.forEach(p => {
            if (currentTeams[p.team_label]) {
                currentTeams[p.team_label].push(p.username);
            }
            userMap[p.username] = {
                avatar: p.avatar,
                place: p.place,
                ready: !!p.ready
            };
        });

        const mode = (roomData.setting_mode || '1V1').toUpperCase().split('V');
        const maxTeamA = parseInt(mode[0]) || 1;
        const maxTeamB = parseInt(mode[1]) || 1;

        // 操作处理
        if (operation === 0) { // 退出
            await conn.execute(
                'DELETE FROM room_participants WHERE room_id = ? AND username = ?',
                [roomData.id, username]
            );

            // 更新本地副本
            delete userMap[username];
            const currentTeamLabel = currentTeams.A.includes(username) ? 'A' : 'B';
            currentTeams[currentTeamLabel] = currentTeams[currentTeamLabel].filter(n => n !== username);

        } else if (operation === 1) { // 加入
            const teamKey = targetTeam === 1 ? 'A' : 'B';
            const maxPos = targetTeam === 1 ? maxTeamA : maxTeamB;

            // 验证位置有效性
            if (position <= 0 || position > maxPos) {
                ctx.body = { success: false, message: '无效的位置' };
                await conn.rollback();
                return;
            }

            // 检查是否已在房间中
            if (participants.some(p => p.username === username)) {
                ctx.body = { success: false, message: '请先退出当前队伍' };
                await conn.rollback();
                return;
            }

            // 检查位置是否被占用
            if (participants.some(p => p.team_label === teamKey && p.place === position)) {
                ctx.body = { success: false, message: '该位置已被占用' };
                await conn.rollback();
                return;
            }

            // 获取用户头像
            const [userRows] = await conn.execute('SELECT avatar FROM user WHERE username = ? LIMIT 1', [username]);
            const avatar = userRows.length > 0 ? userRows[0].avatar : '';

            // 插入新成员
            await conn.execute(
                'INSERT INTO room_participants (room_id, username, team_label, avatar, place, ready) VALUES (?, ?, ?, ?, ?, 0)',
                [roomData.id, username, teamKey, avatar, position]
            );

            // 更新本地副本
            currentTeams[teamKey].push(username);
            userMap[username] = {
                avatar,
                place: position,
                ready: false
            };
        }

        // 更新房间最后更新时间
        const now = new Date();
        await conn.execute(
            'UPDATE room SET last_updated = ? WHERE id = ?',
            [now, roomData.id]
        );

        await conn.commit();

        const result = {
            team: currentTeams,
            user: userMap,
            setting: {
                mode: roomData.setting_mode,
                rating_lowest: roomData.setting_rating_lowest,
                rating_highest: roomData.setting_rating_highest,
                problem_count: roomData.setting_problem_count
            },
            last_updated: now
        };

        // 广播更新
        ctx.app.emit('broadcast', {
            type: 'room_update',
            roomId: roomUrl,
            last_updated: now,
            data: result
        });

        ctx.body = {
            success: true,
            data: result,
            message: '房间信息已更新'
        };

    } catch (err) {
        logger.error(`room_user_update 错误: ${err.message}`);
        if (conn) await conn.rollback();
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    } finally {
        if (conn) conn.release();
    }
}

export default {
    'POST /room_user_update': updateRoomUser
};
