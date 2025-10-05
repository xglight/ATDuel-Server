// contest_start.mjs
import pool from '../db.mjs';
import config from '../config.mjs';

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
        const users = [...row[0].user.A, ...row[0].user.B];
        if (users.some(u => !u.ready)) {
            ctx.status = 403;
            ctx.body = { success: false, error: '房间未准备' };
            return;
        }
        const user = row[0].user;
        if (user.A.length === 0 || user.B.length === 0) {
            ctx.status = 403;
            ctx.body = { success: false, error: 'A 或 B 队伍人数为 0' };
            return;
        }
        const id = row[0].id;
        const url = row[0].url;
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

        const allUsers = [...user.A, ...user.B];
        const atnames = await Promise.all(allUsers.map(u => fetch(config.buildApiUrl(`/atname/${u.name}`)).then(res => res.text())));
        const userAtnameMap = new Map(allUsers.map((u, i) => [u.name, atnames[i]]));

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
                    console.error(`Attempt ${i + 1} failed for ${username} on ${task}:`, error.message);
                    if (i === 2) return false; // Return false after the last attempt
                    await new Promise(res => setTimeout(res, 1000 * (i + 1))); // Exponential backoff
                }
            }
            return false;
        };

        const getProblemsByTier = (problems, count) => {
            if (count <= 3) return [problems];
            const range = maxRating - minRating;
            const tier1Max = minRating + range * 0.3;
            const tier2Max = minRating + range * 0.8;
            return [
                problems.filter(p => p.difficulty <= tier1Max),
                problems.filter(p => p.difficulty > tier1Max && p.difficulty <= tier2Max),
                problems.filter(p => p.difficulty > tier2Max),
            ];
        };

        const generateValidProblem = async (problems) => {
            if (problems.length === 0) return null;
            // Pick a random problem, but retry a few times if a valid one isn't found
            for (let i = 0; i < 5; i++) {
                const problem = problems[Math.floor(Math.random() * problems.length)];
                if (!problem) continue;

                const checkResults = await Promise.all(
                    allUsers.map(u => checkUserAC(u.name, problem.url.split('/').pop()))
                );

                if (!checkResults.some(hasAC => hasAC)) {
                    return problem;
                }
            }
            return null; // Return null if no valid problem is found after retries
        };

        const problemTiers = getProblemsByTier(filteredProblems, problemCount);
        const problemPromises = problemTiers.flatMap(tier =>
            Array.from({ length: Math.ceil(problemCount * 2 / problemTiers.length) }, () => generateValidProblem(tier.length > 0 ? tier : filteredProblems))
        );

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
