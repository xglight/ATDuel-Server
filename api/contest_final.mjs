// contest_final.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 结束比赛并计算 Rating 变动
 * @param {object} ctx - Koa context
 * @param {function} next - Koa next function
 */
async function contest_final(ctx, next) {
    const { contestId, team } = ctx.request.body;
    if (!contestId) {
        ctx.status = 400;
        ctx.body = {
            message: 'contestId is required'
        };
        return;
    }

    logger.debug(`contest_final: 结束比赛: 比赛 ID ${contestId}${team ? `, 触发队伍 ${team}` : ''}`);

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 查询比赛信息
        const [rows] = await conn.execute('SELECT * FROM contest WHERE url = ?', [contestId]);

        if (rows.length === 0) {
            ctx.status = 404;
            ctx.body = {
                message: 'contest not found'
            };
            await conn.rollback();
            return;
        }

        const contest = rows[0];

        // 如果比赛已经结束，直接返回成功
        if (contest.status === 1) {
            await conn.commit();
            ctx.status = 200;
            ctx.body = {
                success: true,
                message: 'contest already finalized'
            };
            return;
        }

        // 更新比赛状态为已结束，并设置结束时间
        await conn.execute(
            'UPDATE contest SET status = 1, endTime = CURRENT_TIMESTAMP WHERE url = ?',
            [contestId]
        );

        let ratingChanges = null;
        // 如果是 Rated 比赛，计算 Rating 变动
        if (contest.rated) {
            const teamData = typeof contest.team === 'string' ? JSON.parse(contest.team) : contest.team;
            const userData = typeof contest.user === 'string' ? JSON.parse(contest.user) : contest.user;
            const problems = typeof contest.problem === 'string' ? JSON.parse(contest.problem) : contest.problem;

            const allUsernames = [...(teamData.A || []), ...(teamData.B || [])];

            if (allUsernames.length > 0) {
                ratingChanges = {};
                // 获取选手的当前 Rating 和 比赛历史
                const [users] = await conn.query('SELECT username, rating, contest FROM user WHERE username IN (?)', [allUsernames]);
                const userMap = new Map(users.map(u => [u.username, u]));

                // 3.1 团队有效评分 (Effective Team Rating)
                // R_team = sum(Ri)/k + (k-1)*50
                const getEffRating = (teamMembers) => {
                    if (!teamMembers || teamMembers.length === 0) return 0;
                    const ratings = teamMembers.map(name => userMap.get(name)?.rating || 0);
                    const avgRating = ratings.reduce((a, b) => a + b, 0) / teamMembers.length;
                    return avgRating + (teamMembers.length - 1) * 50;
                };

                const RA_eff = getEffRating(teamData.A);
                const RB_eff = getEffRating(teamData.B);

                // 3.2 期望胜率 (Expectation)
                // EA = 1 / (1 + 10^((RB_eff - RA_eff) / 400))
                const EA = 1 / (1 + Math.pow(10, (RB_eff - RA_eff) / 400));
                const EB = 1 - EA;

                // 3.3 实际表现分 (Actual Performance)
                // Stotal = sum of all problem scores
                // SA_actual = 0.5 + 0.5 * (ScoreA - ScoreB) / Stotal
                const Stotal = problems.reduce((sum, p) => sum + (p.score || 0), 0) || 1;
                const scoreA = contest.scorea || 0;
                const scoreB = contest.scoreb || 0;
                const SA_actual = 0.5 + 0.5 * (scoreA - scoreB) / Stotal;
                const SB_actual = 1 - SA_actual;

                // 3.4 团队变动总池 (Delta Pool)
                // Delta_Team = K * (S_actual - E) * k
                const K = 32;
                const deltaPoolA = K * (SA_actual - EA) * (teamData.A?.length || 0);
                const deltaPoolB = K * (SB_actual - EB) * (teamData.B?.length || 0);



                /**
                 * 计算并更新单个队伍成员的 Rating
                 * @param {string[]} teamMembers 队伍成员列表
                 * @param {number} deltaPool 团队变动总池
                 * @param {number} teamScore 团队总分
                 */
                const processTeam = async (teamMembers, deltaPool, teamScore) => {
                    if (!teamMembers) return;
                    for (const username of teamMembers) {
                        const u = userMap.get(username);
                        if (!u) continue;

                        const userContests = typeof u.contest === 'string' ? JSON.parse(u.contest || '[]') : (u.contest || []);
                        const userMatchCount = userContests.length;
                        const userScore = userData[username]?.score || 0;

                        let deltaU;
                        if (deltaPool >= 0) {
                            // 4.1 当队伍获胜 / 表现优于预期: 基础奖励 + 贡献奖励
                            // Wu = 0.3 * (1/k) + 0.7 * (Score_u / Score_Team)
                            const k = teamMembers.length;
                            const mvpContribution = teamScore > 0 ? (userScore / teamScore) : (1 / k);
                            const weight = (0.3 / k) + (0.7 * mvpContribution);
                            deltaU = deltaPool * weight;
                        } else {
                            // 4.2 当队伍失败 / 表现低于预期: 责任权重制
                            // Wu = Ru / sum(Ri)
                            const teamRatingsSum = teamMembers.reduce((sum, name) => sum + (userMap.get(name)?.rating || 0), 0);
                            const weight = teamRatingsSum > 0 ? (u.rating / teamRatingsSum) : (1 / teamMembers.length);
                            deltaU = deltaPool * weight;
                        }

                        // 5.1 定级赛机制 (Placement Matches): 场次 < 5，变动值 * 2.5
                        if (userMatchCount < 5) {
                            deltaU *= 2.5;
                        }

                        const oldRating = u.rating || 0;
                        // 5.2 最低分保护: Rating 不低于 0
                        const newRating = Math.max(0, Math.round(oldRating + deltaU));
                        ratingChanges[username] = {
                            oldRating,
                            newRating,
                            delta: newRating - oldRating
                        };

                        // 更新用户 Rating 和 比赛记录 (将 contest.id 加入历史)
                        if (!userContests.includes(contest.id)) {
                            userContests.push(contest.id);
                        }

                        await conn.execute(
                            'UPDATE user SET rating = ?, contest = ? WHERE username = ?',
                            [newRating, JSON.stringify(userContests), username]
                        );
                    }
                };

                await processTeam(teamData.A, deltaPoolA, scoreA);
                await processTeam(teamData.B, deltaPoolB, scoreB);

                // 将 Rating 变动记录到 contest 表中 (Rating 列)
                await conn.execute(
                    'UPDATE contest SET Rating = ? WHERE url = ?',
                    [JSON.stringify(ratingChanges), contestId]
                );
            }
        }

        await conn.commit();
        ctx.status = 200;
        ctx.body = {
            success: true,
            message: 'contest finalized',
            ratingChanges: contest.rated ? ratingChanges : null
        };
    } catch (err) {
        logger.error(`contest_final: 结束比赛失败: ${err.message}`);
        if (conn) {
            await conn.rollback();
        }
        ctx.status = 500;
        ctx.body = {
            success: false,
            message: 'Internal server error'
        };
    } finally {
        if (conn) {
            conn.release();
        }
    }
}

export default {
    'POST /contest_final': contest_final
}
