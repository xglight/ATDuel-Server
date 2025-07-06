// contest_ac.mjs
import pool from '../db.mjs';

async function contest_ac(ctx, next) {
    try {
        // 参数校验
        const { contestId, username, title } = ctx.request.body;
        if (!contestId || !username || !title) {
            ctx.status = 400;
            ctx.body = { error: '缺少必要参数' };
            return;
        }

        // 查询比赛
        const [rows] = await pool.execute(
            'SELECT * FROM contest WHERE url = ?', [contestId]
        );
        if (rows.length === 0) {
            ctx.status = 404;
            ctx.body = { error: '比赛不存在' };
            return;
        }

        // 更新题目状态
        const problems = rows[0].problem;
        const user = rows[0].user;
        const scorea = rows[0].scorea;
        const scoreb = rows[0].scoreb;
        let updated = false;

        for (let i = 0; i < problems.length; i++) {
            if (problems[i].title.includes(title) && problems[i].status == 0) {
                user.A.forEach((userA) => {
                    if (userA.name == username) {
                        scorea += problems[i].score;
                        userA.score += problems[i].score;
                    }
                });
                user.B.forEach((userB) => {
                    if (userB.name == username) {
                        scoreb += problems[i].score;
                        userB.score += problems[i].score;
                    }
                });
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
            ctx.status = 200;
            ctx.body = { success: true, message: 'AC状态更新成功' };
        }
    } catch (err) {
        console.error('更新AC状态失败:', err);
        ctx.status = 500;
        ctx.body = { error: '服务器内部错误' };
    }
}

export default {
    'POST /contest_ac': contest_ac
};
