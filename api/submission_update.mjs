// submission_update.mjs

import pool from '../db.mjs';
import config from '../config.mjs';
import logger from '../logger.mjs';

/**
 * 处理队伍成员的提交记录
 * 
 * @param {Array} team - 队伍成员列表 (用户名字符串数组或包含 name 属性的对象数组)
 * @param {string} problemName - 题目名称
 * @param {Array} subdata - 提交记录数据
 * @param {string} startTime - 比赛开始时间
 * @param {string} problemContest - 题目所属比赛名 (可选)
 */
async function processTeamSubmissions(team, problemName, subdata, startTime, problemContest) {
    if (!team || !team.length) return;

    await Promise.all(team.map(async (member) => {
        const username = typeof member === 'string' ? member : member.name;
        try {
            const atNameRes = await fetch(config.buildApiUrl(`/atname/${username}`)).then(res => res.json());
            const ATName = atNameRes.success ? atNameRes.data : username;
            const res = await fetch(config.buildApiUrl(`/user_submissions`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: ATName,
                    problem_id: problemName,
                    startTime: startTime,
                    contest: problemContest
                })
            });
            const data = await res.json();

            if (data.success && Array.isArray(data.data)) {
                for (const submission of data.data) {
                    const t1 = new Date(startTime);
                    const t2 = new Date(submission.time);
                    if (t2 < t1) continue;

                    const tmp = {
                        task: problemName,
                        username: username,
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
            }
        } catch (err) {
            logger.error(`submission_update: 处理用户 ${username} 的提交记录失败: ${err.message}`);
        }
    }));
}

/**
 * 更新提交记录的 API 处理函数
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function submission_update(ctx) {
    try {
        const { problemTitle, contestId, username, token } = ctx.request.body;
        if (!problemTitle || !contestId || !username || !token) {
            ctx.status = 200;
            ctx.body = { success: false, message: '参数无效' };
            return;
        }

        // 校验 Token
        const [loginRows] = await pool.execute('SELECT * FROM login_status WHERE username = ? AND token = ?', [username, token]);
        if (loginRows.length === 0) {
            ctx.status = 401;
            ctx.body = { success: false, message: '未登录或 Token 无效' };
            return;
        }

        const problemName = problemTitle.split('-')[0].trim();
        // 获取当前比赛数据
        const [contestRows] = await pool.execute('SELECT * FROM contest WHERE url = ?', [contestId]);
        if (!contestRows.length) {
            ctx.status = 404;
            ctx.body = { success: false, message: '比赛不存在' };
            return;
        }

        const contest = contestRows[0];

        // 如果比赛已经结束，只同步提交记录，不更新分数
        const isContestEnded = contest.status === 2;

        // 校验题目是否属于该比赛，并获取题目所属的 AtCoder 比赛名
        const [problemRows] = await pool.execute(
            `SELECT cp.*, p.contest as problem_contest 
             FROM contest_problems cp 
             LEFT JOIN problem p ON cp.problem_id = p.id 
             WHERE cp.contest_id = ? AND cp.title = ?`,
            [contest.id, problemTitle]
        );
        if (problemRows.length === 0) {
            ctx.status = 200;
            ctx.body = { success: false, message: '该题目不属于此比赛' };
            return;
        }

        const problemContest = problemRows[0].problem_contest;

        // 验证用户是否为比赛成员
        const [teamRows] = await pool.execute('SELECT team_label FROM contest_teams WHERE contest_id = ? AND username = ?', [contest.id, username]);
        if (teamRows.length === 0) {
            ctx.status = 403;
            ctx.body = { success: false, message: '您不是该比赛的参赛者，无法判题' };
            return;
        }

        logger.info(`submission_update: 正在更新提交记录: ${problemName} (比赛: ${problemContest || '无'})，操作者: ${username}`);

        // 获取比赛队伍信息
        const [teams] = await pool.execute('SELECT * FROM contest_teams WHERE contest_id = ?', [contest.id]);
        const teamA = teams.filter(t => t.team_label === 'A').map(t => t.username);
        const teamB = teams.filter(t => t.team_label === 'B').map(t => t.username);

        const subdata = [];

        // 处理两队提交记录，传入 contest.startTime 避免全局变量冲突
        await Promise.all([
            processTeamSubmissions(teamA, problemName, subdata, contest.startTime, problemContest),
            processTeamSubmissions(teamB, problemName, subdata, contest.startTime, problemContest)
        ]);

        let conn;
        try {
            conn = await pool.getConnection();
            await conn.beginTransaction();

            // 更新数据库中的提交记录
            for (const sub of subdata) {
                const [existing] = await conn.execute(
                    'SELECT id FROM contest_submissions WHERE contest_id = ? AND username = ? AND task_title = ? AND submission_time = ?',
                    [contest.id, sub.username, sub.task, sub.time]
                );

                if (existing.length > 0) {
                    await conn.execute(
                        'UPDATE contest_submissions SET status = ? WHERE id = ?',
                        [sub.status, existing[0].id]
                    );
                } else {
                    await conn.execute(
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
                        await conn.execute(
                            'UPDATE contest_problems SET status = 1, acuser = ? WHERE contest_id = ? AND title = ?',
                            [firstAC.username, contest.id, problemTitle]
                        );

                        // 2. 更新队伍总分
                        const scoreField = userTeam.team_label === 'A' ? 'scorea' : 'scoreb';
                        await conn.execute(
                            `UPDATE contest SET ${scoreField} = ${scoreField} + ? WHERE id = ?`,
                            [scoreToAdd, contest.id]
                        );

                        // 3. 更新该用户的个人分数
                        await conn.execute(
                            'UPDATE contest_participants SET score = score + ? WHERE contest_id = ? AND username = ?',
                            [scoreToAdd, contest.id, firstAC.username]
                        );

                        logger.info(`submission_update: 题目 "${problemTitle}" 被 ${firstAC.username} (队伍 ${userTeam.team_label}) 解决`);
                    }
                }
            }

            await conn.commit();

            // 如果有 AC 且成功更新，则广播
            if (problemRows[0].status === 0 && !isContestEnded) {
                const acSubmissions = subdata.filter(s => s.status === 'AC');
                if (acSubmissions.length > 0) {
                    ctx.app.emit('broadcast', {
                        type: 'contest_update',
                        contestId: contestId,
                        action: 'score_updated'
                    });
                }
            }

        } catch (err) {
            if (conn) await conn.rollback();
            throw err;
        } finally {
            if (conn) conn.release();
        }

        ctx.status = 200;
        ctx.body = { success: true, message: '提交记录更新成功' };
    } catch (error) {
        logger.error(`submission_update 错误: ${error.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '更新提交记录失败' };
    }
}

export default {
    'POST /submission_update': submission_update
}
