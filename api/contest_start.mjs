// contest_start.mjs
import pool from '../db.mjs';

async function contest_start(ctx, next) {
    const { room_id } = ctx.request.body;

    if (!room_id) {
        ctx.status = 200;
        ctx.body = { success: false, error: '参数错误' };
        return;
    }
    try {
        const [row] = await pool.execute('SELECT * FROM rooms WHERE url =?', [room_id]);
        if (row.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, error: '房间不存在' };
            return;
        }
        let isReady = true;
        let acount = row[0].user.A.length, bcount = row[0].user.B.length;
        for (let i = 0; i < acount; i++) {
            if (row[0].user.A[i].ready == false) {
                isReady = false;
                break;
            }
        }
        for (let i = 0; i < bcount; i++) {
            if (row[0].user.B[i].ready == false) {
                isReady = false;
                break;
            }
        }
        if (isReady == false) {
            ctx.status = 403;
            ctx.body = { success: false, error: '房间未准备' };
            return;
        }
        if (acount == 0 || bcount == 0) {
            ctx.status = 403;
            ctx.body = { success: false, error: 'A 或 B 队伍人数为 0' };
            return;
        }
        const id = row[0].id;
        const url = row[0].url;
        const user = row[0].user;
        for (let i = 0; i < user.A.length; i++) delete user.A[i].ready;
        for (let i = 0; i < user.B.length; i++) delete user.B[i].ready;
        const maxRating = row[0].setting.rating_highest;
        const minRating = row[0].setting.rating_lowest;
        const problemCount = row[0].setting.problem_count;
        const rated = row[0].rated;
        const problemList = [];
        // 获取所有符合条件的题目
        const [allProblems] = await pool.execute('SELECT * FROM problem WHERE difficulty BETWEEN ? AND ?', [minRating, maxRating]);
        const filteredProblems = allProblems.filter(p => !p.title.includes('ahc'));

        console.log(problemCount);
        // 根据题目数量决定难度分档
        const getProblemsByTier = () => {
            if (problemCount <= 3) {
                // 题目数≤3，不分区
                return [filteredProblems];
            }

            // 题目数>3，分为三个难度区间
            const range = maxRating - minRating;
            const tier1Max = minRating + range * 0.3;
            const tier2Max = minRating + range * 0.8;

            const tier1 = filteredProblems.filter(p => p.difficulty <= tier1Max);
            const tier2 = filteredProblems.filter(p => p.difficulty > tier1Max && p.difficulty <= tier2Max);
            const tier3 = filteredProblems.filter(p => p.difficulty > tier2Max);

            return [tier1, tier2, tier3];
        };

        const problemTiers = getProblemsByTier();

        // 并行生成并检查多个题目
        const generateValidProblem = async (problems) => {
            let problem;
            if (problems.length > 0) {
                problem = problems[Math.floor(Math.random() * problems.length)];
            } else {
                // 如果该难度区间没有题目，则从所有题目中随机选择
                problem = filteredProblems[Math.floor(Math.random() * filteredProblems.length)];
            }

            // 并行检查用户A的AC记录
            const checkUserAC = async (username, task, retries = 3) => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

                for (let attempt = 1; attempt <= retries; attempt++) {
                    try {
                        const result = await fetch("http://10.0.3.113:3001/user_submissions", {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ username, task, status: 'AC' }),
                            signal: controller.signal
                        });
                        clearTimeout(timeoutId);

                        if (!result.ok) {
                            if (result.status >= 500 && attempt < retries) {
                                await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // 指数退避
                                continue;
                            }
                            throw new Error(`HTTP error! status: ${result.status}`);
                        }

                        const data = await result.json();
                        return data.length > 0;
                    } catch (err) {
                        clearTimeout(timeoutId);
                        if (attempt === retries) {
                            console.error(`Failed to check user AC after ${retries} attempts:`, err);
                            return false;
                        }
                    }
                }
                return false;
            };

            // 控制并发请求数量
            const MAX_CONCURRENT_REQUESTS = 10;
            const processInBatches = async (items, processFn) => {
                const results = [];
                for (let i = 0; i < items.length; i += MAX_CONCURRENT_REQUESTS) {
                    const batch = items.slice(i, i + MAX_CONCURRENT_REQUESTS);
                    const batchResults = await Promise.all(batch.map(processFn));
                    results.push(...batchResults);
                }
                return results;
            };

            // 使用分批处理并行检查用户A和用户B
            const [aResults, bResults] = await Promise.all([
                processInBatches(user.A, user => checkUserAC(user.name, problem.url.split('/').pop())),
                processInBatches(user.B, user => checkUserAC(user.name, problem.url.split('/').pop()))
            ]);

            // 如果没有用户AC过此题，则返回该题目
            if (!aResults.some(hasAC => hasAC) && !bResults.some(hasAC => hasAC)) {
                return problem;
            }
            return null;
        };

        // 并行生成多个题目，确保从各难度区间均匀选择
        const problemPromises = [];
        if (problemTiers.length === 1) {
            // 不分区的情况
            for (let i = 0; i < problemCount * 2; i++) {
                problemPromises.push(generateValidProblem(problemTiers[0]));
            }
        } else {
            // 分区的情况，每个区间生成足够候选题目
            const problemsPerTier = Math.ceil(problemCount * 2 / problemTiers.length);
            for (const tier of problemTiers) {
                for (let i = 0; i < problemsPerTier; i++) {
                    problemPromises.push(generateValidProblem(tier));
                }
            }
        }

        // 等待所有题目生成完成
        const candidateProblems = (await Promise.all(problemPromises)).filter(p => p !== null);

        // 选取前problemCount个有效题目

        for (let i = 0; i < Math.min(problemCount, candidateProblems.length); i++) {
            candidateProblems[i].status = 0;
            candidateProblems[i].acuser = "";
            candidateProblems[i].score = 0;
            problemList.push(candidateProblems[i]);
        }

        problemList.sort((a, b) => a.difficulty - b.difficulty);

        let score = 100;

        for (let i = 0; i < problemList.length; i++) {
            problemList[i].score = score;
            score = score + 100;
        }

        const contestData = JSON.stringify({
            url: url,
            user: JSON.stringify(user),
            problemList: JSON.stringify(problemList),
            rated: rated
        });
        console.log(`比赛开始: ${contestData}`);
        await pool.execute('INSERT INTO contest (url, startTime, user, problem, status, rated) VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE user = VALUES(user), problem = VALUES(problem), status = VALUES(status), rated = VALUES(rated)', [url, JSON.stringify(user), JSON.stringify(problemList), 0, rated]);
        // 删除房间
        await pool.execute('DELETE FROM rooms WHERE url = ?', [url]);
        const now = Date.now();
        // 广播比赛开始通知
        ctx.app.emit('broadcast', {
            type: 'contest_started',
            roomId: room_id,
            message: '比赛已开始',
            contestData: {
                id,
                url,
                user,
                problemList,
                start_time: now,
                rated
            }
        });

        ctx.status = 200;
        ctx.body = { success: true, data: contestData };
    } catch (err) {
        console.log(err);
        ctx.status = 500;
        ctx.body = { success: false, error: '服务器错误' };
        return;
    }
}

export default {
    'POST /contest_start': contest_start
}
