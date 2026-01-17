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

        logger.debug(`contest_ac: Updating AC status: Contest ID ${contestId}, user ${username}, problem ${title}`);

        const contest = rows[0];
        const [problems] = await pool.query('SELECT * FROM contest_problems WHERE contest_id = ?', [contest.id]);
        const [teams] = await pool.query('SELECT * FROM contest_teams WHERE contest_id = ?', [contest.id]);

        let scorea = contest.scorea;
        let scoreb = contest.scoreb;
        let updated = false;

        for (let i = 0; i < problems.length; i++) {
            if (problems[i].title.includes(title) && problems[i].status == 0) {
                // 检查用户属于哪个队伍并更新分数
                const userTeam = teams.find(t => t.username === username);
                if (userTeam) {
                    if (userTeam.team_label === 'A') {
                        scorea += problems[i].score;
                    } else {
                        scoreb += problems[i].score;
                    }

                    // 更新参与者分数
                    await pool.query(
                        'UPDATE contest_participants SET score = score + ? WHERE contest_id = ? AND username = ?',
                        [problems[i].score, contest.id, username]
                    );

                    // 更新题目状态
                    await pool.query(
                        'UPDATE contest_problems SET status = 1 WHERE id = ?',
                        [problems[i].id]
                    );

                    updated = true;
                    break;
                }
            }
        }

        if (updated) {
            await pool.execute(
                'UPDATE contest SET scorea = ?, scoreb = ? WHERE url = ?',
                [scorea, scoreb, contestId]
            );
            // 广播分数更新
            ctx.app.emit('broadcast', {
                type: 'contest_update',
                contestId: contestId
            });

            ctx.status = 200;
            ctx.body = { success: true, message: 'AC status updated successfully' };
        }
    } catch (err) {
        logger.error(`contest_ac: Failed to update AC status: ${err.message}`);
        ctx.status = 500;
        ctx.body = { error: 'Internal server error' };
    }
}

export default {
    'POST /contest_ac': contest_ac
};
