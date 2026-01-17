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

    logger.debug(`contest_final: Finalizing contest: Contest ID ${contestId}${team ? `, triggered by team ${team}` : ''}`);

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
        if (contest.status === 2) { // 假设 2 是已结算
            await conn.commit();
            ctx.status = 200;
            ctx.body = {
                success: true,
                message: 'contest already finalized'
            };
            return;
        }

        // 更新比赛状态为已结算，并设置结束时间
        await conn.execute(
            'UPDATE contest SET status = 2, endTime = CURRENT_TIMESTAMP WHERE url = ?',
            [contestId]
        );

        // 获取比赛数据
        const [teams] = await conn.query('SELECT * FROM contest_teams WHERE contest_id = ?', [contest.id]);
        const [participants] = await conn.query('SELECT * FROM contest_participants WHERE contest_id = ?', [contest.id]);
        const [problems] = await conn.query('SELECT * FROM contest_problems WHERE contest_id = ?', [contest.id]);

        const teamData = { A: [], B: [] };
        teams.forEach(t => teamData[t.team_label].push(t.username));

        const userData = {};
        participants.forEach(p => userData[p.username] = p);

        const allUsernames = participants.map(p => p.username);

        let ratingChanges = null;
        // 如果是 Rated 比赛，计算 Rating 变动
        if (contest.rated) {
            if (allUsernames.length > 0) {
                ratingChanges = {};
                // 获取选手的当前 Rating
                const [users] = await conn.query('SELECT username, rating FROM user WHERE username IN (?)', [allUsernames]);
                const userMap = new Map(users.map(u => [u.username, u]));

                // 获取每个用户的参赛次数 (不包含本次)
                const [histories] = await conn.query('SELECT username, COUNT(*) as count FROM user_contest_history WHERE username IN (?) GROUP BY username', [allUsernames]);
                const historyMap = new Map(histories.map(h => [h.username, h.count]));

                // 3.1 团队有效评分 (Effective Team Rating)
                const getEffRating = (teamMembers) => {
                    if (!teamMembers || teamMembers.length === 0) return 0;
                    const ratings = teamMembers.map(name => userMap.get(name)?.rating || 0);
                    const avgRating = ratings.reduce((a, b) => a + b, 0) / teamMembers.length;
                    return avgRating + (teamMembers.length - 1) * 50;
                };

                const RA_eff = getEffRating(teamData.A);
                const RB_eff = getEffRating(teamData.B);

                const EA = 1 / (1 + Math.pow(10, (RB_eff - RA_eff) / 400));
                const EB = 1 - EA;

                const Stotal = problems.reduce((sum, p) => sum + (p.score || 0), 0) || 1;
                const scoreA = contest.scorea || 0;
                const scoreB = contest.scoreb || 0;
                const SA_actual = 0.5 + 0.5 * (scoreA - scoreB) / Stotal;
                const SB_actual = 1 - SA_actual;

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

                        const userMatchCount = historyMap.get(username) || 0;
                        const userScore = userData[username]?.score || 0;

                        let deltaU;
                        if (deltaPool >= 0) {
                            const k = teamMembers.length;
                            const mvpContribution = teamScore > 0 ? (userScore / teamScore) : (1 / k);
                            const weight = (0.3 / k) + (0.7 * mvpContribution);
                            deltaU = deltaPool * weight;
                        } else {
                            const teamRatingsSum = teamMembers.reduce((sum, name) => sum + (userMap.get(name)?.rating || 0), 0);
                            const weight = teamRatingsSum > 0 ? (u.rating / teamRatingsSum) : (1 / teamMembers.length);
                            deltaU = deltaPool * weight;
                        }

                        if (userMatchCount < 5) {
                            deltaU *= 2.5;
                        }

                        const oldRating = u.rating || 0;
                        const newRating = Math.max(0, Math.round(oldRating + deltaU));
                        const delta = newRating - oldRating;
                        ratingChanges[username] = {
                            oldRating,
                            newRating,
                            delta
                        };

                        // 记录 Rating 变动
                        await conn.execute(
                            'INSERT INTO contest_ratings (contest_id, username, old_rating, new_rating, delta) VALUES (?, ?, ?, ?, ?)',
                            [contest.id, username, oldRating, newRating, delta]
                        );

                        // 更新用户 Rating
                        await conn.execute(
                            'UPDATE user SET rating = ? WHERE username = ?',
                            [newRating, username]
                        );

                        // 记录参赛历史
                        await conn.execute(
                            'INSERT INTO user_contest_history (username, contest_id) VALUES (?, ?)',
                            [username, contest.id]
                        );
                    }
                };

                await processTeam(teamData.A, deltaPoolA, scoreA);
                await processTeam(teamData.B, deltaPoolB, scoreB);
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
        logger.error(`contest_final: Failed to finalize contest: ${err.message}`);
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
