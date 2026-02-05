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
 */
async function processTeamSubmissions(team, problemName, subdata, startTime) {
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
                    startTime: startTime
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
                    username: submission.username,
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
        const { problemTitle, contestId } = ctx.request.body;
        if (!problemTitle || !contestId) {
            ctx.status = 200;
            ctx.body = { success: false, error: 'Invalid parameters' };
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
        logger.info(`submission_update: Updating submissions: ${problemName}`);

        // 获取比赛队伍信息
        const [teams] = await pool.query('SELECT * FROM contest_teams WHERE contest_id = ?', [contest.id]);
        const teamA = teams.filter(t => t.team_label === 'A').map(t => t.username);
        const teamB = teams.filter(t => t.team_label === 'B').map(t => t.username);

        const subdata = [];

        // 处理两队提交记录，传入 contest.startTime 避免全局变量冲突
        await Promise.all([
            processTeamSubmissions(teamA, problemName, subdata, contest.startTime),
            processTeamSubmissions(teamB, problemName, subdata, contest.startTime)
        ]);

        // 更新数据库
        for (const sub of subdata) {
            // 检查是否已存在
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
