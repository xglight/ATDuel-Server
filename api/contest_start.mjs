// contest_start.mjs
import pool from '../db.mjs';
import config from '../config.mjs';
import logger from '../logger.mjs';

async function contest_start(ctx, next) {
    const { room_id } = ctx.request.body;

    if (!room_id) {
        ctx.status = 200;
        ctx.body = { success: false, error: '参数错误' };
        return;
    }

    logger.debug(`contest_start: 开始比赛: 房间 ID ${room_id}`);

    try {
        const [row] = await pool.execute('SELECT * FROM room WHERE url =?', [room_id]);
        if (row.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, error: '房间不存在' };
            return;
        }
        const room = row[0];
        const team = typeof room.team === 'string' ? JSON.parse(room.team) : room.team;
        const user = typeof room.user === 'string' ? JSON.parse(room.user) : room.user;

        const allUsernames = [...team.A, ...team.B];
        if (allUsernames.length === 0) {
            ctx.status = 403;
            ctx.body = { success: false, error: '房间内无用户' };
            return;
        }

        if (allUsernames.some(name => !user[name] || !user[name].ready)) {
            ctx.status = 403;
            ctx.body = { success: false, error: '房间未准备' };
            return;
        }

        if (team.A.length === 0 || team.B.length === 0) {
            ctx.status = 403;
            ctx.body = { success: false, error: 'A 或 B 队伍人数为 0' };
            return;
        }

        const id = room.id;
        const url = room.url;

        // 准备比赛用的用户数据，移除 ready 字段并添加 score
        const contestUser = {};
        for (const username of allUsernames) {
            contestUser[username] = {
                avatar: user[username].avatar,
                place: user[username].place,
                score: 0
            };
        }

        const maxRating = room.setting.rating_highest;
        const minRating = room.setting.rating_lowest;
        const problemCount = room.setting.problem_count;
        const rated = room.rated;
        const problemList = [];
        // 获取所有符合条件的题目
        const [allProblems] = await pool.execute('SELECT * FROM problem WHERE difficulty BETWEEN ? AND ?', [minRating, maxRating]);
        const filteredProblems = allProblems.filter(p => !p.title.includes('ahc'));

        const atnames = await Promise.all(allUsernames.map(name => fetch(config.buildApiUrl(`/atname/${name}`)).then(res => res.text())));
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

            for (let i = 0; i < count; i++) {
                // 计算目标难度，确保在 [min, max] 之间均匀分布
                const targetDiff = count > 1
                    ? min + (max - min) * (i / (count - 1))
                    : (min + max) / 2;

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

                // 如果还是没有题目，尝试从所有可用题目中找最接近的
                if (candidates.length === 0) {
                    candidates = problems
                        .filter(p => !usedUrls.has(p.url))
                        .sort((a, b) => Math.abs(a.difficulty - targetDiff) - Math.abs(b.difficulty - targetDiff))
                        .slice(0, 5);
                }

                // 随机排序候选题目
                candidates.sort(() => Math.random() - 0.5);

                let selected = null;
                // 检查候选题目是否已被用户 AC，限制检查数量以防过多请求
                const checkLimit = Math.min(candidates.length, 5);
                for (let j = 0; j < checkLimit; j++) {
                    const cand = candidates[j];
                    const task = cand.url.split('/').pop();
                    const checkResults = await Promise.all(
                        allUsernames.map(name => checkUserAC(name, task))
                    );

                    if (!checkResults.some(hasAC => hasAC)) {
                        selected = cand;
                        break;
                    }
                }

                // 如果所有候选都被 AC 了，就从候选里挑一个
                if (!selected && candidates.length > 0) {
                    selected = candidates[0];
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
        problemList.push(...selectedProblems);

        problemList.sort((a, b) => a.difficulty - b.difficulty);

        let score = 100;

        for (let i = 0; i < problemList.length; i++) {
            problemList[i].score = score;
            score = score + 100;
        }

        const contestData = JSON.stringify({
            url: url,
            team: JSON.stringify(team),
            user: JSON.stringify(contestUser),
            problemList: JSON.stringify(problemList),
            rated: rated
        });
        logger.info(`contest_start: 比赛开始: ${url}`);
        await pool.execute('INSERT INTO contest (id, url, startTime, team, user, problem, status, rated) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)', [id, url, JSON.stringify(team), JSON.stringify(contestUser), JSON.stringify(problemList), 0, rated]);
        // 删除房间
        await pool.execute('DELETE FROM room WHERE url = ?', [url]);
        const now = Date.now();
        // 广播比赛开始通知
        ctx.app.emit('broadcast', {
            type: 'contest_started',
            roomId: room_id,
            message: '比赛已开始',
            contestData: {
                id,
                url,
                team,
                user: contestUser,
                problemList,
                start_time: now,
                rated
            }
        });

        ctx.status = 200;
        ctx.body = { success: true, data: contestData };
    } catch (err) {
        logger.error(`contest_start: 开始比赛失败: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, error: '服务器错误' };
        return;
    }
}

export default {
    'POST /contest_start': contest_start
}
