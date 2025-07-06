// submission_update.mjs

import pool from '../db.mjs';

async function processTeamSubmissions(team, problemName, subdata) {
    for (const member of team) {
        const ATName = await fetch(`http://10.0.3.113:3001/atname/${member.name}`).then(res => res.text());
        console.log(ATName);
        const res = await fetch(`http://10.0.3.113:3001/user_submissions`, {
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

async function submission_update(ctx, next) {
    try {
        const { problemName, contestId } = ctx.request.body;

        // 获取当前比赛数据
        const [contest] = await pool.query('SELECT * FROM contest WHERE url = ?', [contestId]);
        if (!contest.length) {
            ctx.status = 404;
            ctx.body = { success: false, message: '比赛不存在' };
            return;
        }
        let subdata = contest[0].submission || [];

        // 获取比赛队伍信息
        const response = await fetch(`http://10.0.3.113:3001/contest/${contestId}`);
        const { user: teams } = await response.json();

        // 处理两队提交记录
        await processTeamSubmissions(teams.A, problemName, subdata);
        await processTeamSubmissions(teams.B, problemName, subdata);

        // 更新数据库
        await pool.query(
            'UPDATE contest SET submission = ? WHERE url = ?',
            [JSON.stringify(subdata), contestId]
        );

        ctx.status = 200;
        ctx.body = { success: true, message: '提交记录更新成功' };
    } catch (error) {
        console.error('提交记录更新失败:', error);
        ctx.status = 500;
        ctx.body = { success: false, message: '提交记录更新失败' };
    }
}

export default {
    'POST /submission_update': submission_update
}
