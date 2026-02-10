// room_ready.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';


/**
 * 更新房间准备状态接口
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function roomReady(ctx) {
    const { room_id: roomUrl, team: targetTeam, position, ready, username, token } = ctx.request.body;

    // 参数验证
    if (!roomUrl || !targetTeam || position === undefined || ready === undefined || !username || !token) {
        ctx.status = 400;
        ctx.body = { success: false, message: '缺少必要参数' };
        return;
    }

    logger.debug(`room_ready: 正在更新准备状态, 房间: ${roomUrl}, 用户: ${username}, 队伍: ${targetTeam}, 位置: ${position}, 状态: ${ready}`);

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

        // 获取房间数据并加锁
        const [roomRows] = await conn.execute('SELECT id, url, master, setting_mode, setting_rating_lowest, setting_rating_highest, setting_problem_count, setting_categories, rated FROM room WHERE url = ? FOR UPDATE', [roomUrl]);
        if (roomRows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '未找到该房间' };
            await conn.rollback();
            return;
        }

        const roomData = roomRows[0];

        // 获取房间成员
        const [participants] = await conn.execute(
            'SELECT id, username, team_label, avatar, place, ready FROM room_participants WHERE room_id = ?',
            [roomData.id]
        );

        // 查找该位置的用户，并验证是否是本人操作
        const participant = participants.find(p => p.team_label === targetTeam && p.place === position);
        if (!participant) {
            ctx.status = 404;
            ctx.body = { success: false, message: '该位置未找到用户' };
            await conn.rollback();
            return;
        }

        if (participant.username !== username) {
            ctx.status = 403;
            ctx.body = { success: false, message: '只能修改自己的准备状态' };
            await conn.rollback();
            return;
        }

        // 更新准备状态
        await conn.execute(
            'UPDATE room_participants SET ready = ? WHERE id = ?',
            [ready ? 1 : 0, participant.id]
        );

        // 更新房间最后更新时间
        const now = new Date();
        await conn.execute(
            'UPDATE room SET last_updated = ? WHERE id = ?',
            [now, roomData.id]
        );

        await conn.commit();

        // 构建返回数据
        const currentTeams = { A: [], B: [] };
        const userMap = {};

        participants.forEach(p => {
            if (currentTeams[p.team_label]) {
                currentTeams[p.team_label].push(p.username);
            }
            userMap[p.username] = {
                avatar: p.avatar,
                place: p.place,
                ready: p.username === participant.username ? !!ready : !!p.ready
            };
        });

        const result = {
            id: roomData.id,
            url: roomData.url,
            master: roomData.master,
            team: currentTeams,
            user: userMap,
            setting: {
                mode: roomData.setting_mode,
                rating_lowest: roomData.setting_rating_lowest,
                rating_highest: roomData.setting_rating_highest,
                problem_count: roomData.setting_problem_count,
                categories: roomData.setting_categories
            },
            rated: !!roomData.rated,
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
            message: '准备状态已更新'
        };

    } catch (err) {
        logger.error(`room_ready 错误: ${err.message}`);
        if (conn) await conn.rollback();
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    } finally {
        if (conn) conn.release();
    }
}

export default {
    'POST /room_ready': roomReady
}
