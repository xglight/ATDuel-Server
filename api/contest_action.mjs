// contest_action.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';
import actionStore from '../tools/contest_action_store.mjs';
import { finalizeContest } from './contest_final.mjs';
import { v4 as uuidv4 } from 'uuid';
import { verifyUser } from '../utils/auth.mjs';

// 内存存储冷却时间: username -> lastRequestTimestamp
const cooldowns = new Map();

/**
 * 发起平局或认输请求
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function requestContestAction(ctx) {
    const { contestId, type } = ctx.request.body;

    if (!contestId || !['draw', 'surrender'].includes(type)) {
        ctx.status = 400;
        ctx.body = { success: false, message: '参数无效' };
        return;
    }

    try {
        // 校验 Token
        const authResult = await verifyUser(ctx);
        if (!authResult.success) {
            ctx.status = 401;
            ctx.body = { success: false, message: '未登录或已过期' };
            return;
        }

        const username = authResult.username;
        logger.debug(`contest_action: 用户 ${username} 请求 ${type}, 比赛 ID: ${contestId}`);

        // 检查冷却时间 (1分钟)
        const now = Date.now();
        const lastRequest = cooldowns.get(username);
        if (lastRequest && now - lastRequest < 60000) {
            const remaining = Math.ceil((60000 - (now - lastRequest)) / 1000);
            ctx.status = 429;
            ctx.body = { success: false, message: `请求过于频繁，请在 ${remaining} 秒后重试` };
            return;
        }

        // 检查比赛状态
        const [contestRows] = await pool.execute('SELECT * FROM contest WHERE url = ? LIMIT 1', [contestId]);
        if (contestRows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '未找到该比赛' };
            return;
        }

        const contest = contestRows[0];
        if (contest.status === 2) {
            ctx.status = 400;
            ctx.body = { success: false, message: '比赛已经结束' };
            return;
        }
        const dbContestId = contest.id;

        // 获取参赛者信息和队伍信息
        const [participants] = await pool.execute('SELECT username FROM contest_participants WHERE contest_id = ?', [dbContestId]);
        const [teams] = await pool.execute('SELECT username, team_label FROM contest_teams WHERE contest_id = ?', [dbContestId]);

        const participantsRows = participants;
        const teamsRows = teams;

        const userPart = participantsRows.find(p => p.username === username);
        if (!userPart) {
            ctx.status = 403;
            ctx.body = { success: false, message: '你不是该比赛的参赛者' };
            return;
        }

        const userTeamLabel = teamsRows.find(t => t.username === username)?.team_label;

        // 检查是否已有进行中的请求
        if (actionStore.get(contestId)) {
            ctx.status = 400;
            ctx.body = { success: false, message: '已有正在进行的请求' };
            return;
        }

        let totalNeeded = 0;
        if (type === 'draw') {
            // 全场 > 2/3 同意
            totalNeeded = Math.ceil(participantsRows.length * (2 / 3));
            if (totalNeeded <= 1 && participantsRows.length > 1) totalNeeded = 2; // 至少2人（如果总人数大于1）
            if (participantsRows.length === 1) totalNeeded = 1;
        } else {
            // 本队至少 2 人同意 (除非本队只有 1 人)
            const teamMembers = teamsRows.filter(t => t.team_label === userTeamLabel);
            totalNeeded = Math.min(teamMembers.length, 2);
        }

        // 如果总票数已经达成（单人认输情况）
        if (totalNeeded === 1) {
            const requestId = uuidv4();
            let result;
            if (type === 'draw') {
                result = await finalizeContest(contestId, true);
            } else {
                const opponentTeam = userTeamLabel === 'A' ? 'B' : 'A';
                result = await finalizeContest(contestId, false, opponentTeam);
            }

            if (result.success && result.message !== '比赛已经结算') {
                const msg = type === 'draw' ? `平局请求已通过。` : `队伍 ${userTeamLabel} 已确认认输。`;

                // 1. 先广播操作结果
                ctx.app.emit('broadcast', {
                    type: 'contest_action_result',
                    contestId: contestId,
                    targetTeam: null,
                    data: {
                        requestId,
                        success: true,
                        message: msg
                    }
                });

                // 2. 延迟 500ms 后广播比赛状态更新，确保消息顺序
                setTimeout(() => {
                    ctx.app.emit('broadcast', {
                        type: 'contest_update',
                        contestId: contestId,
                        status: 2,
                        ratingChanges: result.ratingChanges
                    });
                }, 500);

                ctx.status = 200;
                ctx.body = { success: true, message: '操作已处理' };
                return;
            } else if (result.success && result.message === '比赛已经结算') {
                ctx.status = 200;
                ctx.body = { success: true, message: '比赛已经结算' };
                return;
            }
        }

        // 创建请求
        const requestId = uuidv4();
        const actionData = {
            type,
            requestId,
            requesterTeam: userTeamLabel,
            requesterName: username,
            totalNeeded
        };

        const onExpire = (action) => {
            ctx.app.emit('broadcast', {
                type: 'contest_action_result',
                contestId: contestId,
                targetTeam: action.type === 'surrender' ? action.requesterTeam : null,
                data: {
                    requestId: action.requestId,
                    success: false,
                    reason: 'timeout',
                    message: `${action.type === 'draw' ? '发起的平局请求' : `队伍 ${action.requesterTeam} 发起的认输请求`}已超时自动拒绝`
                }
            });
        };

        actionStore.create(contestId, actionData, onExpire);
        cooldowns.set(username, now);

        // 广播请求
        ctx.app.emit('broadcast', {
            type: 'contest_action_request',
            contestId: contestId,
            targetTeam: type === 'surrender' ? userTeamLabel : null,
            data: {
                type,
                requestId,
                requesterTeam: userTeamLabel,
                requesterName: username,
                totalNeeded,
                currentVotes: 1,
                expireAt: now + 30000
            }
        });

        ctx.status = 200;
        ctx.body = { success: true, message: '请求已发起', data: { requestId } };
    } catch (err) {
        logger.error(`requestContestAction 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

/**
 * 参与投票
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function voteContestAction(ctx) {
    const { contestId, requestId, action } = ctx.request.body;

    if (!contestId || !requestId || !action) {
        ctx.status = 400;
        ctx.body = { success: false, message: '参数无效' };
        return;
    }

    try {
        // 校验 Token
        const authResult = await verifyUser(ctx);
        if (!authResult.success) {
            ctx.status = 401;
            ctx.body = { success: false, message: '未登录或已过期' };
            return;
        }

        const username = authResult.username;
        logger.debug(`contest_action: 用户 ${username} 投票 ${action}, 请求 ID: ${requestId}`);

        const ongoingAction = actionStore.get(contestId);
        if (!ongoingAction || ongoingAction.requestId !== requestId) {
            ctx.status = 404;
            ctx.body = { success: false, message: '请求不存在或已过期' };
            return;
        }

        // 获取参赛者和队伍信息
        const [contestRows] = await pool.execute('SELECT id FROM contest WHERE url = ? LIMIT 1', [contestId]);
        if (contestRows.length === 0) {
            ctx.status = 404;
            ctx.body = { success: false, message: '未找到该比赛' };
            return;
        }

        const dbContestId = contestRows[0].id;
        const [teams] = await pool.execute('SELECT username, team_label FROM contest_teams WHERE contest_id = ?', [dbContestId]);
        const teamsRows = teams;
        const userTeamLabel = teamsRows.find(t => t.username === username)?.team_label;

        if (!userTeamLabel) {
            ctx.status = 403;
            ctx.body = { success: false, message: '你不是该比赛的参赛者' };
            return;
        }

        // 认输请求只能由本队成员投票
        if (ongoingAction.type === 'surrender' && ongoingAction.requesterTeam !== userTeamLabel) {
            ctx.status = 403;
            ctx.body = { success: false, message: '你不能对其他队伍的认输请求投票' };
            return;
        }

        if (action === 'reject') {
            actionStore.clear(contestId);
            ctx.app.emit('broadcast', {
                type: 'contest_action_result',
                contestId: contestId,
                targetTeam: ongoingAction.type === 'surrender' ? ongoingAction.requesterTeam : null,
                data: {
                    requestId,
                    success: false,
                    reason: 'rejected',
                    rejecterName: username,
                    message: `${ongoingAction.type === 'draw' ? '发起的平局请求' : `队伍 ${ongoingAction.requesterTeam} 发起的认输请求`}已被 ${username} 拒绝`
                }
            });
            ctx.status = 200;
            ctx.body = { success: true, message: '投票已处理' };
            return;
        }

        if (action === 'accept') {
            const votes = actionStore.addVote(contestId, username);
            if (votes >= ongoingAction.totalNeeded) {
                actionStore.clear(contestId);
                let result;
                if (ongoingAction.type === 'draw') {
                    result = await finalizeContest(contestId, true);
                } else {
                    const opponentTeam = ongoingAction.requesterTeam === 'A' ? 'B' : 'A';
                    result = await finalizeContest(contestId, false, opponentTeam);
                }

                if (result.success && result.message !== '比赛已经结算') {
                    const msg = ongoingAction.type === 'draw' ? `平局请求已通过。` : `队伍 ${ongoingAction.requesterTeam} 已确认认输。`;

                    ctx.app.emit('broadcast', {
                        type: 'contest_action_result',
                        contestId: contestId,
                        targetTeam: null,
                        data: {
                            requestId,
                            success: true,
                            message: msg
                        }
                    });

                    setTimeout(() => {
                        ctx.app.emit('broadcast', {
                            type: 'contest_update',
                            contestId: contestId,
                            status: 2,
                            ratingChanges: result.ratingChanges
                        });
                    }, 500);
                }
            } else {
                ctx.app.emit('broadcast', {
                    type: 'contest_action_update',
                    contestId: contestId,
                    targetTeam: ongoingAction.type === 'surrender' ? ongoingAction.requesterTeam : null,
                    data: {
                        requestId,
                        currentVotes: votes
                    }
                });
            }

            ctx.status = 200;
            ctx.body = { success: true, message: '投票已处理' };
        }
    } catch (err) {
        logger.error(`voteContestAction 错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

/**
 * 辅助函数：存储比赛消息
 * @param {string} type 消息类型
 * @param {string} contestId 比赛 ID
 * @param {string} teamId 队伍 ID
 * @param {string} sender 发送者
 * @param {string} message 消息内容
 * @param {string} mode 模式
 */
async function storeMessage(type, contestId, teamId, sender, message, mode) {
    await pool.execute(
        'INSERT INTO contest_messages (type, contest_id, team_id, sender, message, mode) VALUES (?,?,?,?,?,?)',
        [type, contestId, teamId, sender, message, mode]
    );
}

export default {
    'POST /contest/request_action': requestContestAction,
    'POST /contest/vote_action': voteContestAction
};
