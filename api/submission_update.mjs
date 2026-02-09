// submission_update.mjs

import pool from '../db.mjs';
import config from '../config.mjs';
import logger from '../logger.mjs';

/**
 * 处理队伍成员的提交记录
 * @param {Array} team 队伍成员列表 (用户名字符串数组或包含 name 属性的对象数组)
 * @param {string} problemName 题目名称
 * @param {Array} subdata 提交记录数据
 * @param {string} startTime 比赛开始时间
 * @param {string} problemContest 题目所属比赛名 (可选)
 */
async function processTeamSubmissions(team, problemName, subdata, startTime, problemContest) {
    if (!team) return;
    for (const member of team) {
        const username = typeof member === 'string' ? member : member.name;
        try {
            const ATName = await fetch(config.buildApiUrl(`/atname/${username}`)).then(res => res.text());
            const res = await fetch(config.buildApiUrl(`/user_submissions`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: ATName,
                    problem_id: problemName,
                    startTime: startTime,
                    contest: problemContest
                })
            });
            const data = await res.json();

            for (const submission of data) {
                const t1 = new Date(startTime);
                const t2 = new Date(submission.time);
                if (t2 < t1) {
                    continue;
                }

                const tmp = {
                    task: problemName,
                    username: username, // 使用本地用户名而不是 ATName
                    status: submission.status,
                    time: submission.time
                };

                const existing = subdata.find(s =>
                    s.task === tmp.task &&
                    s.username === tmp.username &&
                    s.time === tmp.time
                );

                if (existing) {
                    existing.status = tmp.status;
                } else {
                    subdata.push(tmp);
                }
            }
        } catch (err) {
            logger.error(`submission_update: Failed to process submissions for user ${username}: ${err.message}`);
        }
    }
}

/**
 * 更新提交记录的 API 处理函数
 * @param {object} ctx Koa 上下文
 * @param {function} next 下一个中间件
 */
async function submission_update(ctx, next) {
    try {
        const { problemTitle, contestId, username, token } = ctx.request.body;
        if (!problemTitle || !contestId || !username || !token) {
            ctx.status = 200;
            ctx.body = { success: false, error: 'Invalid parameters' };
            return;
        }

        // 校验 Token
        const [loginRows] = await pool.query('SELECT * FROM login_status WHERE username = ? AND token = ?', [username, token]);
        if (loginRows.length === 0) {
            ctx.status = 403;
            ctx.body = { success: false, error: '未登录或 Token 无效' };
            return;
        }

        const problemName = problemTitle.split('-')[0].trim();
        // 获取当前比赛数据
        const [contestRows] = await pool.query('SELECT * FROM contest WHERE url = ?', [contestId]);
        if (!contestRows.length) {
            ctx.status = 404;
            ctx.body = { success: false, message: 'Contest does not exist' };
            return;
        }

        const contest = contestRows[0];

        // 如果比赛已经结束，只同步提交记录，不更新分数
        const isContestEnded = contest.status === 2;

        // 校验题目是否属于该比赛，并获取题目所属的 AtCoder 比赛名
        const [problemRows] = await pool.query(
            `SELECT cp.*, p.contest as problem_contest 
             FROM contest_problems cp 
             LEFT JOIN problem p ON cp.problem_id = p.id 
             WHERE cp.contest_id = ? AND cp.title = ?`,
            [contest.id, problemTitle]
        );
        if (problemRows.length === 0) {
            ctx.status = 200;
            ctx.body = { success: false, error: '该题目不属于此比赛' };
            return;
        }

        const problemContest = problemRows[0].problem_contest;

        // 验证用户是否为比赛成员
        const [teamRows] = await pool.query('SELECT team_label FROM contest_teams WHERE contest_id = ? AND username = ?', [contest.id, username]);
        if (teamRows.length === 0) {
            ctx.status = 200;
            ctx.body = { success: false, error: '您不是该比赛的参赛者，无法判题' };
            return;
        }

        logger.info(`submission_update: Updating submissions: ${problemName} (Contest: ${problemContest || 'N/A'}) by ${username}`);

        // 获取比赛队伍信息
        const [teams] = await pool.query('SELECT * FROM contest_teams WHERE contest_id = ?', [contest.id]);
        const teamA = teams.filter(t => t.team_label === 'A').map(t => t.username);
        const teamB = teams.filter(t => t.team_label === 'B').map(t => t.username);

        const subdata = [];

        // 处理两队提交记录，传入 contest.startTime 避免全局变量冲突
        await Promise.all([
            processTeamSubmissions(teamA, problemName, subdata, contest.startTime, problemContest),
            processTeamSubmissions(teamB, problemName, subdata, contest.startTime, problemContest)
        ]);

        // 更新数据库中的提交记录
        for (const sub of subdata) {
            const [existing] = await pool.query(
                'SELECT id FROM contest_submissions WHERE contest_id = ? AND username = ? AND task_title = ? AND submission_time = ?',
                [contest.id, sub.username, sub.task, sub.time]
            );

            if (existing.length > 0) {
                await pool.query(
                    'UPDATE contest_submissions SET status = ? WHERE id = ?',
                    [sub.status, existing[0].id]
                );
            } else {
                await pool.query(
                    'INSERT INTO contest_submissions (contest_id, username, task_title, status, submission_time) VALUES (?, ?, ?, ?, ?)',
                    [contest.id, sub.username, sub.task, sub.status, sub.time]
                );
            }
        }

        // 检查是否有新的 AC 并更新题目状态及分数
        // 只有当前题目未被解决且比赛未结束时才需要检查
        if (problemRows[0].status === 0 && !isContestEnded) {
            const acSubmissions = subdata.filter(s => s.status === 'AC');
            if (acSubmissions.length > 0) {
                // 按提交时间排序，找到最早的 AC
                acSubmissions.sort((a, b) => new Date(a.time) - new Date(b.time));
                const firstAC = acSubmissions[0];

                // 获取该用户的团队信息
                const userTeam = teams.find(t => t.username === firstAC.username);
                if (userTeam) {
                    const scoreToAdd = problemRows[0].score;

                    // 1. 更新题目状态
                    await pool.query(
                        'UPDATE contest_problems SET status = 1, acuser = ? WHERE contest_id = ? AND title = ?',
                        [firstAC.username, contest.id, problemTitle]
                    );

                    // 2. 更新队伍总分
                    const scoreField = userTeam.team_label === 'A' ? 'scorea' : 'scoreb';
                    await pool.query(
                        `UPDATE contest SET ${scoreField} = ${scoreField} + ? WHERE id = ?`,
                        [scoreToAdd, contest.id]
                    );

                    // 3. 更新该用户的个人分数
                    await pool.query(
                        'UPDATE contest_participants SET score = score + ? WHERE contest_id = ? AND username = ?',
                        [scoreToAdd, contest.id, firstAC.username]
                    );

                    logger.info(`submission_update: Problem "${problemTitle}" solved by ${firstAC.username} for Team ${userTeam.team_label}`);

                    // 广播比赛更新
                    ctx.app.emit('broadcast', {
                        type: 'contest_update',
                        contestId: contestId,
                        action: 'score_updated'
                    });
                }
            }
        }

        ctx.status = 200;
        ctx.body = { success: true, message: 'Submissions updated successfully' };
    } catch (error) {
        logger.error(`submission_update: Failed to update submissions: ${error.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: 'Failed to update submissions' };
    }
}

export default {
    'POST /submission_update': submission_update
}
