// contest_start.mjs
import pool from '../db.mjs';
import config from '../config.mjs';
import logger from '../logger.mjs';

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
        const master = room.master; // 获取房主

        // 准备比赛用的用户数据，移除 ready 字段并添加 score
        const contestUser = {};
        for (const username of allUsernames) {
            contestUser[username] = {
                avatar: user[username].avatar,
                place: user[username].place,
                score: 0
            };
        }

        const maxRating = room.setting_rating_highest ?? 3000;
        const minRating = room.setting_rating_lowest ?? 0;
        const problemCount = room.setting_problem_count ?? 5;
        const rated = room.rated;

        logger.debug(`contest_start: Fetching problems with difficulty between ${minRating} and ${maxRating}`);

        const problemList = [];
        // 获取所有符合条件的题目
        const [allProblems] = await pool.execute('SELECT * FROM problem WHERE difficulty BETWEEN ? AND ?', [minRating, maxRating]);
        const filteredProblems = allProblems.filter(p => !p.title.includes('ahc'));

        logger.debug(`contest_start: Found ${allProblems.length} total problems, ${filteredProblems.length} after filtering`);

        if (filteredProblems.length === 0) {
            ctx.status = 200;
            ctx.body = { success: false, error: 'No problems found in this difficulty range' };
            return;
        }

        if (filteredProblems.length < problemCount) {
            logger.warn(`contest_start: Requested ${problemCount} problems but only found ${filteredProblems.length}`);
        }

        const atnames = await Promise.all(allUsernames.map(async (name) => {
            try {
                const url = config.buildApiUrl(`/atname/${name}`);
                const res = await fetch(url);
                if (!res.ok) {
                    logger.warn(`contest_start: Failed to fetch ATName for ${name}: ${res.status}`);
                    return name; // Fallback to username
                }
                return await res.text();
            } catch (err) {
                logger.error(`contest_start: Error fetching ATName for ${name}: ${err.message}`);
                return name;
            }
        }));
        const userAtnameMap = new Map(allUsernames.map((name, i) => [name, atnames[i]]));

        const checkUserAC = async (username, task) => {
            const atname = userAtnameMap.get(username);
            if (!atname) return false;

            for (let i = 0; i < 3; i++) { // Retry up to 3 times
                try {
                    const response = await Promise.race([
                        fetch(config.buildApiUrl('/user_submissions'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ username: atname, task, status: 'AC' }),
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                    ]);

                    if (response.ok) {
                        const data = await response.json();
                        return data.length > 0;
                    } else if (response.status < 500) {
                        return false; // Don't retry for client-side errors
                    }
                } catch (error) {
                    logger.error(`Attempt ${i + 1} failed for ${username} on ${task}: ${error.message}`);
                    if (i === 2) return false; // Return false after the last attempt
                    await new Promise(res => setTimeout(res, 1000 * (i + 1))); // Exponential backoff
                }
            }
            return false;
        };

        /**
         * 选择比赛题目
         * @param {Array} problems 候选题目列表
         * @param {number} count 需要选择的题目数量
         * @param {number} min 最低难度
         * @param {number} max 最高难度
         * @returns {Promise<Array>} 选择的题目列表
         */
        const selectProblems = async (problems, count, min, max) => {
            const result = [];
            const usedUrls = new Set();

            logger.debug(`selectProblems: Selecting ${count} problems from ${problems.length} candidates`);

            for (let i = 0; i < count; i++) {
                // 计算目标难度，确保在 [min, max] 之间均匀分布
                const targetDiff = count > 1
                    ? min + (max - min) * (i / (count - 1))
                    : (min + max) / 2;

                logger.debug(`selectProblems: Problem ${i + 1}/${count}, target difficulty: ${targetDiff.toFixed(0)}`);

                // 初始搜索范围
                let margin = 50;
                let candidates = [];

                // 逐渐扩大搜索范围直到找到足够的候选题目
                while (candidates.length < 5 && margin < (max - min + 100)) {
                    candidates = problems.filter(p =>
                        Math.abs(p.difficulty - targetDiff) <= margin &&
                        !usedUrls.has(p.url)
                    );
                    margin += 50;
                }

                logger.debug(`selectProblems: Found ${candidates.length} candidates within margin ${margin - 50}`);

                // 如果还是没有题目，尝试从所有可用题目中找最接近的
                if (candidates.length === 0) {
                    candidates = problems
                        .filter(p => !usedUrls.has(p.url))
                        .sort((a, b) => Math.abs(a.difficulty - targetDiff) - Math.abs(b.difficulty - targetDiff))
                        .slice(0, 5);
                    logger.debug(`selectProblems: Fallback to ${candidates.length} closest problems`);
                }

                if (candidates.length === 0) {
                    logger.warn(`selectProblems: No candidates available for problem ${i + 1}`);
                    continue;
                }

                // 随机排序候选题目
                candidates.sort(() => Math.random() - 0.5);

                let selected = null;
                // 检查候选题目是否已被用户 AC，限制检查数量以防过多请求
                const checkLimit = Math.min(candidates.length, 5);
                for (let j = 0; j < checkLimit; j++) {
                    const cand = candidates[j];
                    const task = cand.url.split('/').pop();

                    try {
                        const checkResults = await Promise.all(
                            allUsernames.map(name => checkUserAC(name, task))
                        );

                        if (!checkResults.some(hasAC => hasAC)) {
                            selected = cand;
                            logger.debug(`selectProblems: Selected problem ${selected.title} (not AC'd by anyone)`);
                            break;
                        }
                    } catch (err) {
                        logger.error(`selectProblems: Error checking AC status for ${task}: ${err.message}`);
                    }
                }

                // 如果所有候选都被 AC 了，就从候选里挑一个
                if (!selected && candidates.length > 0) {
                    selected = candidates[0];
                    logger.debug(`selectProblems: Selected problem ${selected.title} (all candidates were AC'd)`);
                }

                if (selected) {
                    usedUrls.add(selected.url);
                    result.push({
                        ...selected,
                        status: 0,
                        acuser: "",
                        score: 0 // 稍后统一设置
                    });
                }
            }
            return result;
        };

        const selectedProblems = await selectProblems(filteredProblems, problemCount, minRating, maxRating);

        if (selectedProblems.length === 0) {
            ctx.status = 200;
            ctx.body = { success: false, error: 'Failed to select any suitable problems' };
            return;
        }

        logger.info(`contest_start: Successfully selected ${selectedProblems.length} problems`);
        problemList.push(...selectedProblems);

        problemList.sort((a, b) => a.difficulty - b.difficulty);

        let score = 100;

        for (let i = 0; i < problemList.length; i++) {
            problemList[i].score = score;
            score = score + 100;
        }

        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + config.content.timeLimit * 1000);

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // 1. 创建比赛主表记录
            await conn.query(
                'INSERT INTO contest (id, url, master, startTime, endTime, status, rated) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [id, url, master, startTime, endTime, 1, rated]
            );

            // 2. 创建题目记录
            for (const p of problemList) {
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
