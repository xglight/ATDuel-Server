// contest_ac.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 更新比赛 AC 状态 API 处理函数
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function contest_ac(ctx) {
    try {
        // 参数校验
        const { contestId, username, title } = ctx.request.body;
        if (!contestId || !username || !title) {
            ctx.status = 400;
            ctx.body = { success: false, message: 'contestId, username, title 均不能为空' };
            return;
        }

        // 查询比赛
        const [rows] = await pool.execute(
            'SELECT id, scorea, scoreb FROM contest WHERE url = ? LIMIT 1', [contestId]
        );

        if (rows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '未找到该比赛' };
            return;
        }

        logger.debug(`contest_ac: 正在更新 AC 状态: 比赛 ID ${contestId}, 用户 ${username}, 题目 ${title}`);

        const contest = rows[0];
        // 并行查询题目和队伍信息
        const [[problems], [teams]] = await Promise.all([
            pool.execute('SELECT * FROM contest_problems WHERE contest_id = ?', [contest.id]),
            pool.execute('SELECT team_label, username FROM contest_teams WHERE contest_id = ?', [contest.id])
        ]);

        let scorea = contest.scorea;
        let scoreb = contest.scoreb;
        let updated = false;

        // 寻找符合条件的题目
        const problemToUpdate = problems.find(p => p.title.includes(title) && p.status == 0);
        const userTeam = teams.find(t => t.username === username);

        if (problemToUpdate && userTeam) {
            let conn;
            try {
                conn = await pool.getConnection();
                await conn.beginTransaction();

                // 1. 尝试更新题目状态（增加 status = 0 条件防止重复更新）
                const [updateProblemRes] = await conn.execute(
                    'UPDATE contest_problems SET status = 1, acuser = ? WHERE contest_id = ? AND problem_id = ? AND status = 0',
                    [username, contest.id, problemToUpdate.problem_id]
                );

                // 只有当本次请求成功将状态从 0 改为 1 时，才进行分数增加
                if (updateProblemRes.affectedRows > 0) {
                    // 2. 更新参与者分数
                    await conn.execute(
                        'UPDATE contest_participants SET score = score + ? WHERE contest_id = ? AND username = ?',
                        [problemToUpdate.score, contest.id, username]
                    );

                    // 3. 更新比赛总分
                    const scoreField = userTeam.team_label === 'A' ? 'scorea' : 'scoreb';
                    await conn.execute(
                        `UPDATE contest SET ${scoreField} = ${scoreField} + ? WHERE id = ?`,
                        [problemToUpdate.score, contest.id]
                    );

                    await conn.commit();
                    updated = true;
                } else {
                    await conn.rollback();
                    updated = false;
                }
            } catch (err) {
                if (conn) await conn.rollback();
                throw err;
            } finally {
                if (conn) conn.release();
            }
        }

        if (updated) {
            // 广播分数更新和题目状态更新
            ctx.app.emit('broadcast', {
                type: 'contest_update',
                contestId: contestId,
                action: 'score_updated',
                data: {
                    problemTitle: title,
                    status: 1,
                    acuser: username
                }
            });

            ctx.status = 200;
            ctx.body = { success: true, message: 'AC 状态更新成功' };
        } else {
            ctx.status = 400;
            ctx.body = { success: false, message: '无需更新或未找到匹配记录' };
        }
    } catch (err) {
        logger.error(`contest_ac 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'POST /contest_ac': contest_ac
};
