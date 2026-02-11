// room_update_setting.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';
import config from '../config.mjs';
import { verifyUser } from '../utils/auth.mjs';

/**
 * 修改房间设置接口
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function updateRoomSetting(ctx) {
    const { roomId: roomUrl, playerCount, difficultyMin, difficultyMax, problemCount, isRated, categories } = ctx.request.body;

    if (!roomUrl) {
        ctx.status = 400;
        ctx.body = { success: false, message: '缺少必要参数' };
        return;
    }

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        // 校验 Token
        const authResult = await verifyUser(ctx);
        if (!authResult.success) {
            ctx.status = 401;
            ctx.body = { success: false, message: '未登录或已过期' };
            await conn.rollback();
            return;
        }

        const username = authResult.username;
        logger.debug(`room_update_setting: 用户 ${username} 正在修改房间 ${roomUrl} 的设置`);

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

        // 校验人数限制：修改后的房间总人数不能少于当前已在房间的人数
        const [participantCountRows] = await conn.execute(
            'SELECT COUNT(*) as count FROM room_participants WHERE room_id = ?',
            [room.id]
        );
        const currentParticipantCount = participantCountRows[0].count;

        // playerCount 格式通常为 "1v1", "2v2" 等，需要解析出总人数
        const teamSize = parseInt(playerCount.split('v')[0]);
        const targetMaxPlayers = teamSize * 2;

        // 校验人数限制是否超过全局配置
        if (teamSize > config.content.peopleLimit) {
            ctx.status = 400;
            ctx.body = {
                success: false,
                message: `修改失败：目标模式 (${playerCount}) 超过了系统允许的最大人数 (${config.content.peopleLimit}v${config.content.peopleLimit})。`
            };
            await conn.rollback();
            return;
        }

        if (currentParticipantCount > targetMaxPlayers) {
            ctx.status = 400;
            ctx.body = {
                success: false,
                message: `修改失败：当前房间已有 ${currentParticipantCount} 人，目标模式 (${playerCount}) 最多容纳 ${targetMaxPlayers} 人。请先移除多余成员。`
            };
            await conn.rollback();
            return;
        }

        const now = new Date();

        // 格式化 categories，确保是字符串
        let categoriesStr = '';
        if (Array.isArray(categories)) {
            categoriesStr = categories.join(',');
        } else if (typeof categories === 'string') {
            categoriesStr = categories;
        } else {
            // 如果没传，保持原有设置或默认
            const [oldRoom] = await conn.execute('SELECT setting_categories FROM room WHERE id = ?', [room.id]);
            categoriesStr = oldRoom[0].setting_categories || config.content.categories;
        }

        // 更新设置
        await conn.execute(
            `UPDATE room SET 
                setting_mode = ?, 
                setting_rating_lowest = ?, 
                setting_rating_highest = ?, 
                setting_problem_count = ?, 
                setting_categories = ?,
                rated = ?, 
                last_updated = ? 
            WHERE id = ?`,
            [
                playerCount,
                difficultyMin,
                difficultyMax,
                problemCount,
                categoriesStr,
                isRated ? 1 : 0,
                now,
                room.id
            ]
        );

        await conn.commit();
        logger.info(`room_update_setting: 房主 ${username} 修改了房间 ${roomUrl} 的设置`);

        // 获取更新后的完整房间数据用于广播
        const [updatedRoomRows] = await conn.execute(
            'SELECT * FROM room WHERE id = ?',
            [room.id]
        );
        const [participants] = await conn.execute(
            'SELECT username, team_label, avatar, place, ready FROM room_participants WHERE room_id = ?',
            [room.id]
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

        const updatedRoom = updatedRoomRows[0];
        const resultData = {
            id: updatedRoom.id,
            url: updatedRoom.url,
            master: updatedRoom.master,
            team: currentTeams,
            user: userMap,
            setting: {
                mode: updatedRoom.setting_mode,
                rating_lowest: updatedRoom.setting_rating_lowest,
                rating_highest: updatedRoom.setting_rating_highest,
                problem_count: updatedRoom.setting_problem_count,
                categories: updatedRoom.setting_categories
            },
            rated: !!updatedRoom.rated,
            last_updated: updatedRoom.last_updated
        };

        // 广播更新通知，包含完整数据以确保客户端同步
        ctx.app.emit('broadcast', {
            type: 'room_update',
            roomId: roomUrl,
            last_updated: now,
            data: resultData
        });

        ctx.body = {
            success: true,
            message: '房间设置已更新',
            data: resultData
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
