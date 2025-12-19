// submission_update.mjs

import pool from '../db.mjs';
import config from '../config.mjs';
import logger from '../logger.mjs';

/**
 * 处理队伍成员的提交记录
 * @param {Array} team 队伍成员列表 (用户名字符串数组或包含 name 属性的对象数组)
 * @param {string} problemName 题目名称
 * @param {Array} subdata 提交记录数据
 */
async function processTeamSubmissions(team, problemName, subdata) {
    if (!team) return;
    for (const member of team) {
        const username = typeof member === 'string' ? member : member.name;
        const ATName = await fetch(config.buildApiUrl(`/atname/${username}`)).then(res => res.text());
        const res = await fetch(config.buildApiUrl(`/user_submissions`), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: ATName,
                task: problemName
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
    }
}

let startTime;

/**
 * 更新提交记录的 API 处理函数
 * @param {object} ctx Koa 上下文
 * @param {function} next 下一个中间件
 */
async function submission_update(ctx, next) {
    try {
        const { problemName, contestId } = ctx.request.body;

        // 获取当前比赛数据
        const [contestRows] = await pool.query('SELECT * FROM contest WHERE url = ?', [contestId]);
        if (!contestRows.length) {
            ctx.status = 404;
            ctx.body = { success: false, message: '比赛不存在' };
            return;
        }

        const contest = contestRows[0];
        logger.info(`submission_update: 更新提交记录: ${problemName}`);

        let subdata = contest.submission || [];
        startTime = contest.startTime;

        // 获取比赛队伍信息
        const team = contest.team;
        const user = contest.user;

        // 处理两队提交记录
        if (team) {
            await processTeamSubmissions(team.A, problemName, subdata);
            await processTeamSubmissions(team.B, problemName, subdata);
        }

        // 更新数据库
        await pool.query(
            'UPDATE contest SET submission = ? WHERE url = ?',
            [JSON.stringify(subdata), contestId]
        );

        ctx.status = 200;
        ctx.body = { success: true, message: '提交记录更新成功' };
    } catch (error) {
        logger.error(`submission_update: 更新提交记录失败: ${error.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '提交记录更新失败' };
    }
}

export default {
    'POST /submission_update': submission_update
}
