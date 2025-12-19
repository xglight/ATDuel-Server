// contest_ac.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

async function contest_ac(ctx, next) {
    try {
        // 参数校验
        const { contestId, username, title } = ctx.request.body;
        if (!contestId || !username || !title) {
            ctx.status = 400;
            ctx.body = { error: 'contestId, username, title are required' };
            return;
        }

        // 查询比赛
        const [rows] = await pool.execute(
            'SELECT * FROM contest WHERE url = ?', [contestId]
        );

        if (rows.length === 0) {
            ctx.status = 404;
            ctx.body = { error: 'Not Found' };
            return;
        }

        logger.debug(`contest_ac: 更新 AC 状态: 比赛 ID ${contestId}, 用户 ${username}, 题目 ${title}`);

        // 更新题目状态
        const problems = rows[0].problem;
        const user = rows[0].user;
        const team = rows[0].team;
        let scorea = rows[0].scorea;
        let scoreb = rows[0].scoreb;
        let updated = false;

        for (let i = 0; i < problems.length; i++) {
            if (problems[i].title.includes(title) && problems[i].status == 0) {
                // 检查用户属于哪个队伍并更新分数
                if (team && team.A && team.A.includes(username)) {
                    scorea += problems[i].score;
                    if (user[username]) {
                        user[username].score += problems[i].score;
                    }
                } else if (team && team.B && team.B.includes(username)) {
                    scoreb += problems[i].score;
                    if (user[username]) {
                        user[username].score += problems[i].score;
                    }
                }

                problems[i].status = 1;
                problems[i].acuser = username;
                updated = true;
                break;
            }
        }

        if (updated) {
            await pool.execute(
                'UPDATE contest SET problem = ? WHERE url = ?',
                [JSON.stringify(problems), contestId]
            );
            await pool.execute(
                'UPDATE contest SET user = ? WHERE url = ?',
                [JSON.stringify(user), contestId]
            );
            await pool.execute(
                'UPDATE contest SET scorea = ?, scoreb = ? WHERE url = ?',
                [scorea, scoreb, contestId]
            );

            // 发送系统消息
            const systemMsg = `用户 ${username} 成功解决了题目 ${title}!`;
            try {
                // 存储到数据库
                await pool.query(
                    'INSERT INTO contest_messages (type, contest_id, sender, message, mode) VALUES (?,?,?,?,?)',
                    ['system_message', contestId, 'SYSTEM', systemMsg, 'all']
                );

                // 广播给所有在线用户
                ctx.app.emit('broadcast', {
                    type: 'system_message',
                    contestId: contestId,
                    message: systemMsg,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error(`contest_ac: 发送系统消息失败: ${error.message}`);
            }

            ctx.status = 200;
            ctx.body = { success: true, message: 'AC状态更新成功' };
        }
    } catch (err) {
        logger.error(`contest_ac: 更新 AC 状态失败: ${err.message}`);
        ctx.status = 500;
        ctx.body = { error: '服务器内部错误' };
    }
}

export default {
    'POST /contest_ac': contest_ac
};
