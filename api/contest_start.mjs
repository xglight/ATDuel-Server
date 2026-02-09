// contest_start.mjs
import pool from '../db.mjs';
import config from '../config.mjs';
import logger from '../logger.mjs';
import { updateUserAC } from './user_ac_update.mjs';

/**
 * 获取房间内所有人 AC 过的题目集合
 * @param {string[]} usernames 用户名数组
 * @returns {Promise<Set<string>>} AC 过的题目 ID 集合
 */
async function getAcceptedProblems(usernames) {
    if (!usernames || usernames.length === 0) return new Set();
    try {
        const [rows] = await pool.query(
            'SELECT DISTINCT problem_id FROM user_problem_accept WHERE username IN (?)',
            [usernames]
        );
        return new Set(rows.map(row => row.problem_id));
    } catch (err) {
        logger.error(`getAcceptedProblems: Failed to fetch AC records: ${err.message}`);
        return new Set();
    }
}

/**
 * 选择比赛题目，确保在难度区间内均匀分布
 * @param {Array} filteredProblems 已经预筛选（排除 AC 和 AHC）的候选题目列表
 * @param {number} count 需要选择的题目数量
 * @param {number} min 最低难度
 * @param {number} max 最高难度
 * @returns {Promise<Array>} 选择的题目列表
 */
async function selectProblems(filteredProblems, count, min, max) {
    const result = [];
    const usedUrls = new Set();

    logger.debug(`selectProblems: Selecting ${count} problems from ${filteredProblems.length} candidates in range [${min}, ${max}]`);

    for (let i = 0; i < count; i++) {
        // 计算目标难度，确保在 [min, max] 之间均匀分布
        const targetDiff = count > 1
            ? min + (max - min) * (i / (count - 1))
            : (min + max) / 2;

        // 筛选尚未选用的题目
        let candidates = filteredProblems.filter(p => !usedUrls.has(p.url));

        if (candidates.length === 0) {
            logger.error(`selectProblems: No available problems for index ${i}`);
            continue;
        }

        // 按与目标难度的接近程度排序，取前 10 个最接近的题目
        candidates.sort((a, b) => Math.abs(a.difficulty - targetDiff) - Math.abs(b.difficulty - targetDiff));
        const topCandidates = candidates.slice(0, 10);

        // 从最接近的候选题目中随机选择一个，增加题目多样性
        const selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];

        usedUrls.add(selected.url);
        result.push({
            ...selected,
            status: 0,
            acuser: "",
            score: 0 // 稍后统一设置
        });

        logger.debug(`selectProblems: Selected "${selected.title}" (difficulty: ${selected.difficulty}, target: ${targetDiff.toFixed(0)})`);
    }

    // 最后按难度升序排列
    return result.sort((a, b) => a.difficulty - b.difficulty);
}

/**
 * 开始比赛的 API 处理函数
 * @param {object} ctx Koa 上下文
 * @param {function} next 下一个中间件
 */
async function contest_start(ctx, next) {
    const { room_id } = ctx.request.body;

    if (!room_id) {
        ctx.status = 200;
        ctx.body = { success: false, error: 'Invalid parameters' };
        return;
    }

    logger.debug(`contest_start: Starting contest: Room ID ${room_id}`);

    try {
        const [row] = await pool.execute('SELECT * FROM room WHERE url =?', [room_id]);
        if (row.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, error: 'Room does not exist' };
            return;
        }
        const room = row[0];

        // 获取房间成员
        const [roomParticipants] = await pool.query(
            `SELECT * FROM room_participants WHERE room_id = ?`,
            [room.id]
        );

        const team = { A: [], B: [] };
        const user = {};
        roomParticipants.forEach(p => {
            team[p.team_label].push(p.username);
            user[p.username] = {
                avatar: p.avatar,
                place: p.place,
                ready: !!p.ready
            };
        });

        const allUsernames = [...team.A, ...team.B];
        if (allUsernames.length === 0) {
            ctx.status = 403;
            ctx.body = { success: false, error: 'No users in the room' };
            return;
        }

        // 每次开始比赛前更新所有人的 AC 记录
        logger.debug(`contest_start: Updating AC records for ${allUsernames.join(', ')}`);
        await Promise.allSettled(allUsernames.map(username => updateUserAC(username)));

        if (allUsernames.some(name => !user[name] || !user[name].ready)) {
            ctx.status = 403;
            ctx.body = { success: false, error: 'Room is not ready' };
            return;
        }

        if (team.A.length === 0 || team.B.length === 0) {
            ctx.status = 403;
            ctx.body = { success: false, error: 'Team A or B has 0 members' };
            return;
        }

        const id = room.id;
        const url = room.url;
        const master = room.master;

        const maxRating = room.setting_rating_highest ?? 3000;
        const minRating = room.setting_rating_lowest ?? 0;
        const problemCount = room.setting_problem_count ?? 5;
        const rated = room.rated;

        logger.debug(`contest_start: Fetching problems with difficulty between ${minRating} and ${maxRating}`);

        // 获取所有符合条件的题目，并直接筛选掉 AHC 和房间内任何人已 AC 的题目
        const [allProblems] = await pool.execute('SELECT * FROM problem WHERE difficulty BETWEEN ? AND ?', [minRating, maxRating]);
        const acceptedProblems = await getAcceptedProblems(allUsernames);
        const filteredProblems = allProblems.filter(p => {
            const isAHC = p.title.toLowerCase().includes('ahc');
            const taskId = p.url.split('/').pop();
            const isAccepted = acceptedProblems.has(taskId);
            return !isAHC && !isAccepted;
        });

        logger.debug(`contest_start: Found ${allProblems.length} total problems, ${filteredProblems.length} after filtering AC and AHC`);

        if (filteredProblems.length === 0) {
            ctx.status = 200;
            ctx.body = { success: false, error: 'No problems found in this difficulty range after filtering AC' };
            return;
        }

        // 选择题目
        const selectedProblems = await selectProblems(filteredProblems, problemCount, minRating, maxRating);

        if (selectedProblems.length === 0) {
            ctx.status = 200;
            ctx.body = { success: false, error: 'Failed to select any suitable problems' };
            return;
        }

        // 分配分数 (100, 200, 300...)
        for (let i = 0; i < selectedProblems.length; i++) {
            selectedProblems[i].score = (i + 1) * 100;
        }

        const startTime = new Date();
        // 比赛开始时 endTime 为 NULL，表示进行中
        const endTime = null;

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // 1. 创建比赛主表记录
            await conn.query(
                'INSERT INTO contest (id, url, master, startTime, endTime, status, rated) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [id, url, master, startTime, endTime, 1, rated]
            );

            // 2. 创建题目记录
            for (const p of selectedProblems) {
                await conn.query(
                    'INSERT INTO contest_problems (contest_id, problem_id, title, url, score, status, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [id, p.id, p.title, p.url, p.score, 0, p.difficulty]
                );
            }

            // 3. 创建队伍和参与者记录
            for (const username of team.A) {
                await conn.query('INSERT INTO contest_teams (contest_id, team_label, username) VALUES (?, ?, ?)', [id, 'A', username]);
                await conn.query(
                    'INSERT INTO contest_participants (contest_id, username, score, place, avatar) VALUES (?, ?, ?, ?, ?)',
                    [id, username, 0, user[username].place, user[username].avatar]
                );
            }
            for (const username of team.B) {
                await conn.query('INSERT INTO contest_teams (contest_id, team_label, username) VALUES (?, ?, ?)', [id, 'B', username]);
                await conn.query(
                    'INSERT INTO contest_participants (contest_id, username, score, place, avatar) VALUES (?, ?, ?, ?, ?)',
                    [id, username, 0, user[username].place, user[username].avatar]
                );
            }

            // 4. 删除房间和成员
            await conn.execute('DELETE FROM room_participants WHERE room_id = ?', [id]);
            await conn.execute('DELETE FROM room WHERE id = ?', [id]);

            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        // 广播比赛开始通知
        ctx.app.emit('broadcast', {
            type: 'contest_start',
            roomId: room_id,
            contestId: id
        });

        ctx.status = 200;
        ctx.body = { success: true, data: { id, url, startTime, endTime, rated } };
    } catch (err) {
        logger.error(`contest_start: Failed to start contest: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, error: 'Server Error' };
        return;
    }
}

export default {
    'POST /contest_start': contest_start
}