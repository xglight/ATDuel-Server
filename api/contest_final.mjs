// contest_final.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';
import requestStore from '../tools/change_request_store.mjs';

/**
 * 结束比赛并计算 Rating 变动的核心逻辑
 * @param {string} contestId - 比赛的 URL ID
 * @param {boolean} forceDraw - 是否强制平局 (用于超时自动结束或投票平局)
 * @param {string} winnerTeam - 获胜队伍 ('A' or 'B'，用于认输结算)
 * @returns {Promise<object>} 处理结果
 */
export async function finalizeContest(contestId, forceDraw = false, winnerTeam = null) {
    logger.debug(`finalizeContest: Finalizing contest: Contest ID ${contestId}, forceDraw: ${forceDraw}, winnerTeam: ${winnerTeam}`);

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 查询比赛信息
        const [rows] = await conn.execute('SELECT * FROM contest WHERE url = ?', [contestId]);

        if (rows.length === 0) {
            await conn.rollback();
            return { success: false, message: 'contest not found' };
        }

        const contest = rows[0];

        // 如果比赛已经结束，直接返回成功
        if (contest.status === 2) {
            await conn.commit();
            return { success: true, message: 'contest already finalized' };
        }

        // 更新比赛状态为已结算，并设置结束时间
        await conn.execute(
            'UPDATE contest SET status = 2, endTime = CURRENT_TIMESTAMP WHERE url = ?',
            [contestId]
        );

        // 比赛结束，清除所有挂起的换题请求
        requestStore.clear(contest.id);

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
                const [histories] = await conn.query('SELECT username, COUNT(*) as count FROM contest_participants WHERE username IN (?) AND contest_id != ? GROUP BY username', [allUsernames, contest.id]);
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

                const K = 32;
                const DELTA_MIN = 5;

                // 确定胜负关系
                let winner = null;
                if (!forceDraw) {
                    if (winnerTeam === 'A') winner = 'A';
                    else if (winnerTeam === 'B') winner = 'B';
                    else if (scoreA > scoreB) winner = 'A';
                    else if (scoreB > scoreA) winner = 'B';
                }

                let deltaPoolA = 0;
                let deltaPoolB = 0;

                if (winner) {
                    const winTeamLabel = winner;
                    const loseTeamLabel = winner === 'A' ? 'B' : 'A';
                    const E_win = winner === 'A' ? EA : EB;
                    const k_win = teamData[winTeamLabel]?.length || 0;
                    const S_win = winner === 'A' ? scoreA : scoreB;
                    const S_lose = winner === 'A' ? scoreB : scoreA;

                    // 3.3 统治力系数 (Dominance Factor)
                    const alpha = 0.5 + 0.5 * (S_win - S_lose) / Stotal;

                    // 3.4 团队变动总池计算 (Delta Calculation)
                    const deltaRaw = K * (1 - E_win);
                    const deltaTeamWin = k_win * Math.max(deltaRaw, DELTA_MIN) * alpha;

                    if (winner === 'A') {
                        deltaPoolA = deltaTeamWin;
                        deltaPoolB = -deltaTeamWin;
                    } else {
                        deltaPoolA = -deltaTeamWin;
                        deltaPoolB = deltaTeamWin;
                    }
                } else {
                    // 平局处理：退化为标准 ELO，不应用 alpha 和 DELTA_MIN
                    deltaPoolA = K * (0.5 - EA) * (teamData.A?.length || 0);
                    deltaPoolB = K * (0.5 - EB) * (teamData.B?.length || 0);
                }

                /**
                 * 处理单个队伍的分数分配
                 * @param {string[]} teamMembers 队伍成员列表
                 * @param {number} deltaPool 团队变动总池
                 * @param {number} teamScore 团队总分
                 */
                const processTeam = async (teamMembers, deltaPool, teamScore) => {
                    if (!teamMembers || teamMembers.length === 0) return;
                    for (const username of teamMembers) {
                        const u = userMap.get(username);
                        if (!u) continue;

                        const userMatchCount = historyMap.get(username) || 0;
                        const userScore = userData[username]?.score || 0;

                        let deltaU;
                        if (deltaPool >= 0) {
                            // 4.1 胜方分配策略：协作(40%) + 贡献(60%)
                            const k = teamMembers.length;
                            const mvpContribution = teamScore > 0 ? (userScore / teamScore) : (1 / k);
                            const weight = (0.4 / k) + (0.6 * mvpContribution);
                            deltaU = deltaPool * weight;
                        } else {
                            // 4.2 败方分配策略：能力责任制
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

                        await conn.execute(
                            'INSERT INTO contest_ratings (contest_id, username, old_rating, new_rating, delta) VALUES (?, ?, ?, ?, ?)',
                            [contest.id, username, oldRating, newRating, delta]
                        );

                        await conn.execute(
                            'UPDATE user SET rating = ? WHERE username = ?',
                            [newRating, username]
                        );
                    }
                };

                await processTeam(teamData.A, deltaPoolA, scoreA);
                await processTeam(teamData.B, deltaPoolB, scoreB);
            }
        }

        await conn.commit();
        return {
            success: true,
            message: 'contest finalized',
            ratingChanges: contest.rated ? ratingChanges : null
        };
    } catch (err) {
        logger.error(`finalizeContest: Failed to finalize contest: ${err.message}`);
        if (conn) await conn.rollback();
        throw err;
    } finally {
        if (conn) conn.release();
    }
}

/**
 * 结束比赛 API 处理函数
 */
async function contest_final(ctx, next) {
    const { contestId, team } = ctx.request.body;
    if (!contestId) {
        ctx.status = 400;
        ctx.body = { message: 'contestId is required' };
        return;
    }

    try {
        const result = await finalizeContest(contestId);

        if (result.success && result.message !== 'contest already finalized') {
            // 广播比赛状态更新，这会触发 server.mjs 生成系统消息
            ctx.app.emit('broadcast', {
                type: 'contest_update',
                contestId: contestId,
                status: 2,
                ratingChanges: result.ratingChanges
            });
        }

        ctx.status = result.success ? 200 : (result.message === 'contest not found' ? 404 : 500);
        ctx.body = result;
    } catch (err) {
        ctx.status = 500;
        ctx.body = { success: false, message: 'Internal server error' };
    }
}

export default {
    'POST /contest_final': contest_final
}
