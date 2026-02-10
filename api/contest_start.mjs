// contest_start.mjs
import pool from '../db.mjs';
import config from '../config.mjs';
import logger from '../logger.mjs';
import { updateUserAC } from './user_ac_update.mjs';

/**
 * 获取房间内所有人 AC 过的题目集合
 * 
 * @param {string[]} usernames - 用户名数组
 * @returns {Promise<Set<string>>} AC 过的题目 ID 集合
 */
async function getAcceptedProblems(usernames) {
    if (!usernames || usernames.length === 0) return new Set();
    try {
        const [rows] = await pool.execute(
            'SELECT DISTINCT problem_id FROM user_problem_accept WHERE username IN (?)',
            [usernames]
        );
        return new Set(rows.map(row => row.problem_id));
    } catch (err) {
        logger.error(`getAcceptedProblems: 无法获取 AC 记录: ${err.message}`);
        return new Set();
    }
}

/**
 * 选择比赛题目，确保在难度区间内均匀分布
 * 
 * @param {Array} filteredProblems - 候选题目列表
 * @param {number} count - 需要选择的题目数量
 * @param {number} min - 最低难度
 * @param {number} max - 最高难度
 * @returns {Promise<Array>} 选择的题目列表
 */
async function selectProblems(filteredProblems, count, min, max) {
    const result = [];
    const usedUrls = new Set();

    logger.debug(`selectProblems: 正在从 ${filteredProblems.length} 个候选题目中选择 ${count} 个题目，难度范围 [${min}, ${max}]`);

    for (let i = 0; i < count; i++) {
        // 计算目标难度，确保在 [min, max] 之间均匀分布
        const targetDiff = count > 1
            ? min + (max - min) * (i / (count - 1))
            : (min + max) / 2;

        // 筛选尚未选用的题目
        const candidates = filteredProblems.filter(p => !usedUrls.has(p.url));

        if (candidates.length === 0) {
            logger.error(`selectProblems: 索引 ${i} 没有可用题目`);
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

        logger.debug(`selectProblems: 已选择 "${selected.title}" (难度: ${selected.difficulty}, 目标: ${targetDiff.toFixed(0)})`);
    }

    // 最后按难度升序排列
    return result.sort((a, b) => a.difficulty - b.difficulty);
}

/**
 * 开始比赛接口
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function startContest(ctx) {
    const { room_id: roomUrl } = ctx.request.body;

    if (!roomUrl) {
        ctx.status = 400;
        ctx.body = { success: false, message: '房间 URL 不能为空' };
        return;
    }

    logger.debug(`contest_start: 正在为房间开始比赛: ${roomUrl}`);

    try {
        // 1. 获取房间信息
        const [roomRows] = await pool.execute('SELECT * FROM room WHERE url = ? LIMIT 1', [roomUrl]);
        if (roomRows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '未找到该房间' };
            return;
        }
        const roomData = roomRows[0];

        // 2. 获取房间成员
        const [roomParticipants] = await pool.execute(
            'SELECT * FROM room_participants WHERE room_id = ?',
            [roomData.id]
        );

        const team = { A: [], B: [] };
        const user = {};
        roomParticipants.forEach(p => {
            if (team[p.team_label]) {
                team[p.team_label].push(p.username);
            }
            user[p.username] = {
                avatar: p.avatar,
                place: p.place,
                ready: !!p.ready
            };
        });

        const allUsernames = [...team.A, ...team.B];
        if (allUsernames.length === 0) {
            ctx.status = 400;
            ctx.body = { success: false, message: '房间内没有用户' };
            return;
        }

        // 3. 每次开始比赛前更新所有人的 AC 记录
        logger.debug(`contest_start: 正在更新 ${allUsernames.length} 个用户的 AC 记录`);
        await Promise.allSettled(allUsernames.map(username => updateUserAC(username)));

        // 4. 检查是否所有人都准备好了
        if (allUsernames.some(name => !user[name]?.ready)) {
            ctx.status = 400;
            ctx.body = { success: false, message: '所有玩家必须处于准备就绪状态' };
            return;
        }

        if (team.A.length === 0 || team.B.length === 0) {
            ctx.status = 400;
            ctx.body = { success: false, message: '两个队伍都必须至少有一名成员' };
            return;
        }

        const contestId = roomData.id;
        const master = roomData.master;
        const maxDifficulty = roomData.setting_rating_highest ?? config.content.problemDifficultyUpperLimit;
        const minDifficulty = roomData.setting_rating_lowest ?? config.content.problemDifficultyLowerLimit;
        const problemCount = roomData.setting_problem_count ?? 5;
        const categoriesStr = roomData.setting_categories || config.content.categories;
        const categories = categoriesStr.split(',');
        const rated = !!roomData.rated;

        logger.debug(`contest_start: 正在选择 ${problemCount} 道题目 [${minDifficulty}, ${maxDifficulty}]，类别: ${categoriesStr}`);

        // 5. 获取符合条件的题目，排除 AHC 和已 AC 的题目，并根据类别筛选
        const [allProblems] = await pool.execute('SELECT * FROM problem WHERE difficulty BETWEEN ? AND ?', [minDifficulty, maxDifficulty]);
        const acceptedProblems = await getAcceptedProblems(allUsernames);

        const filteredProblems = allProblems.filter(p => {
            // 1. 排除 Heuristic 比赛 (AHC)
            const contestType = p.contest.substring(0, 3).toUpperCase();
            if (contestType === 'AHC') return false;

            // 2. 排除房间内任意成员已 AC 的题目
            if (acceptedProblems.has(p.problem_id)) return false;

            // 3. 根据比赛类型确定类别 (ABC, ARC, AGC 或 Other)
            const category = ['ABC', 'ARC', 'AGC'].includes(contestType) ? contestType : 'Other';

            // 4. 检查该类别是否在房间允许的范围内
            return categories.includes(category);
        });

        if (filteredProblems.length < problemCount) {
            ctx.status = 400;
            ctx.body = { success: false, message: `在难度范围 [${minDifficulty}, ${maxDifficulty}] 内找不到足够的适用题目（当前可用: ${filteredProblems.length}，需要: ${problemCount}）` };
            return;
        }

        // 6. 选择题目
        const selectedProblems = await selectProblems(filteredProblems, problemCount, minDifficulty, maxDifficulty);

        // 分配分数 (100, 200, 300...)
        selectedProblems.forEach((p, index) => {
            p.score = (index + 1) * 100;
        });

        const startTime = new Date();
        const endTime = null; // 进行中

        // 7. 开启事务创建比赛
        let conn;
        try {
            conn = await pool.getConnection();
            await conn.beginTransaction();

            // 1. 创建比赛主表记录
            await conn.execute(
                'INSERT INTO contest (id, url, master, startTime, endTime, status, rated) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [contestId, roomUrl, master, startTime, endTime, 1, rated]
            );

            // 2. 创建题目记录
            const problemInsertions = selectedProblems.map(p =>
                conn.execute(
                    'INSERT INTO contest_problems (contest_id, problem_id, title, url, score, status, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [contestId, p.id, p.title, p.url, p.score, 0, p.difficulty]
                )
            );
            await Promise.all(problemInsertions);

            // 3. 创建队伍和参与者记录
            const teamAndParticipantInsertions = [];
            for (const label of ['A', 'B']) {
                for (const username of team[label]) {
                    teamAndParticipantInsertions.push(
                        conn.execute('INSERT INTO contest_teams (contest_id, team_label, username) VALUES (?, ?, ?)', [contestId, label, username]),
                        conn.execute(
                            'INSERT INTO contest_participants (contest_id, username, score, place, avatar) VALUES (?, ?, ?, ?, ?)',
                            [contestId, username, 0, user[username].place, user[username].avatar]
                        )
                    );
                }
            }
            await Promise.all(teamAndParticipantInsertions);

            // 4. 删除房间和成员
            await conn.execute('DELETE FROM room_participants WHERE room_id = ?', [contestId]);
            await conn.execute('DELETE FROM room WHERE id = ?', [contestId]);

            await conn.commit();
        } catch (err) {
            if (conn) await conn.rollback();
            throw err;
        } finally {
            if (conn) conn.release();
        }

        logger.info(`contest_start: 比赛 ${roomUrl} 已成功开始`);

        // 8. 广播比赛开始通知
        ctx.app.emit('broadcast', {
            type: 'contest_start',
            roomId: roomUrl,
            contestId: contestId
        });

        ctx.status = 200;
        ctx.body = {
            success: true,
            contestId: contestId,
            data: { id: contestId, url: roomUrl, startTime, endTime, rated },
            message: '比赛已开始'
        };
    } catch (err) {
        logger.error(`contest_start 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'POST /contest_start': startContest
}