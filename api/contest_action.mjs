// api/contest_action.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';
import actionStore from '../tools/contest_action_store.mjs';
import { finalizeContest } from './contest_final.mjs';
import { v4 as uuidv4 } from 'uuid';

// 内存存储冷却时间: username -> lastRequestTimestamp
const cooldowns = new Map();

/**
 * 发起平局或认输请求
 */
async function requestContestAction(ctx) {
    const { contestId, type, username, token } = ctx.request.body;

    if (!contestId || !['draw', 'surrender'].includes(type) || !username || !token) {
        ctx.status = 200;
        ctx.body = { success: false, error: '参数无效' };
        return;
    }

    // 校验 Token
    const [loginRows] = await pool.query('SELECT * FROM login_status WHERE username = ? AND token = ?', [username, token]);
    if (loginRows.length === 0) {
        ctx.status = 403;
        ctx.body = { success: false, error: '未登录或 Token 无效' };
        return;
    }

    // 检查冷却时间 (1分钟)
    const now = Date.now();
    const lastRequest = cooldowns.get(username);
    if (lastRequest && now - lastRequest < 60000) {
        const remaining = Math.ceil((60000 - (now - lastRequest)) / 1000);
        ctx.status = 200;
        ctx.body = { success: false, error: `请求过于频繁，请在 ${remaining} 秒后重试` };
        return;
    }

    // 检查比赛状态
    const [contestRows] = await pool.query('SELECT * FROM contest WHERE url = ?', [contestId]);
    if (contestRows.length === 0 || contestRows[0].status === 2) {
        ctx.status = 200;
        ctx.body = { success: false, error: '比赛不存在或已结束' };
        return;
    }
    const contest = contestRows[0];
    const dbContestId = contest.id;

    // 获取参赛者信息
    const [participants] = await pool.query('SELECT * FROM contest_participants WHERE contest_id = ?', [dbContestId]);
    const userPart = participants.find(p => p.username === username);
    if (!userPart) {
        ctx.status = 200;
        ctx.body = { success: false, error: '您不是该比赛的参赛者' };
        return;
    }

    const [teams] = await pool.query('SELECT * FROM contest_teams WHERE contest_id = ?', [dbContestId]);
    const userTeamLabel = teams.find(t => t.username === username)?.team_label;

    // 检查是否已有进行中的请求
    if (actionStore.get(contestId)) {
        ctx.status = 200;
        ctx.body = { success: false, error: '当前已有正在进行的请求' };
        return;
    }

    let totalNeeded = 0;
    if (type === 'draw') {
        // 全场 > 2/3 同意
        totalNeeded = Math.ceil(participants.length * (2 / 3));
        if (totalNeeded <= 1 && participants.length > 1) totalNeeded = 2; // 至少2人（如果总人数大于1）
        if (participants.length === 1) totalNeeded = 1;
    } else {
        // 本队至少 2 人同意 (除非本队只有 1 人)
        const teamMembers = teams.filter(t => t.team_label === userTeamLabel);
        totalNeeded = Math.min(teamMembers.length, 2);
    }

    // 如果总票数已经达成（单人认输情况）
    if (totalNeeded === 1) {
        const requestId = uuidv4(); // 为单人请求也生成 ID
        try {
            let result;
            if (type === 'draw') {
                result = await finalizeContest(contestId, true);
            } else {
                const opponentTeam = userTeamLabel === 'A' ? 'B' : 'A';
                result = await finalizeContest(contestId, false, opponentTeam);
            }

            if (result.success) {
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
                ctx.body = { success: true };
                return;
            }
        } catch (err) {
            logger.error(`requestContestAction: Immediate finalize failed: ${err.message}`);
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
    ctx.body = { success: true };
}

/**
 * 参与投票
 */
async function voteContestAction(ctx) {
    const { contestId, requestId, action, username, token } = ctx.request.body;

    if (!contestId || !requestId || !action || !username || !token) {
        ctx.status = 200;
        ctx.body = { success: false, error: '参数无效' };
        return;
    }

    // 校验 Token
    const [loginRows] = await pool.query('SELECT * FROM login_status WHERE username = ? AND token = ?', [username, token]);
    if (loginRows.length === 0) {
        ctx.status = 403;
        ctx.body = { success: false, error: '未登录或 Token 无效' };
        return;
    }

    const currentAction = actionStore.get(contestId);
    if (!currentAction || currentAction.requestId !== requestId) {
        ctx.status = 200;
        ctx.body = { success: false, error: '请求已过期或不存在' };
        return;
    }

    if (currentAction.votes.has(username)) {
        ctx.status = 200;
        ctx.body = { success: false, error: '您已经投票过了' };
        return;
    }

    // 权限校验
    const [contestRows] = await pool.query('SELECT id FROM contest WHERE url = ?', [contestId]);
    const dbContestId = contestRows[0].id;
    const [teamRows] = await pool.query('SELECT team_label FROM contest_teams WHERE contest_id = ? AND username = ?', [dbContestId, username]);
    if (teamRows.length === 0) {
        ctx.status = 200;
        ctx.body = { success: false, error: '您不是参赛者' };
        return;
    }
    const userTeam = teamRows[0].team_label;

    if (currentAction.type === 'surrender' && userTeam !== currentAction.requesterTeam) {
        ctx.status = 200;
        ctx.body = { success: false, error: '您不能处理对方队伍的认输请求' };
        return;
    }

    if (action === 'reject') {
        actionStore.clear(contestId);
        ctx.app.emit('broadcast', {
            type: 'contest_action_result',
            contestId: contestId,
            targetTeam: currentAction.type === 'surrender' ? currentAction.requesterTeam : null,
            data: {
                requestId,
                success: false,
                reason: 'rejected',
                message: `${currentAction.type === 'draw' ? '发起的平局请求' : `队伍 ${currentAction.requesterTeam} 发起的认输请求`}被拒绝`
            }
        });
        ctx.status = 200;
        ctx.body = { success: true };
        return;
    }

    // 同意投票
    const voteCount = actionStore.addVote(contestId, username);
    if (voteCount >= currentAction.totalNeeded) {
        // 达成条件
        actionStore.clear(contestId);
        try {
            let result;
            if (currentAction.type === 'draw') {
                result = await finalizeContest(contestId, true);
            } else {
                const winnerTeam = currentAction.requesterTeam === 'A' ? 'B' : 'A';
                result = await finalizeContest(contestId, false, winnerTeam);
            }

            if (result.success) {
                const msg = currentAction.type === 'draw' ? '平局请求已通过。' : `队伍 ${currentAction.requesterTeam} 已确认认输。`;

                // 1. 先广播操作结果（如：平局请求已通过 / 队伍 A 已确认认输）
                ctx.app.emit('broadcast', {
                    type: 'contest_action_result',
                    contestId: contestId,
                    targetTeam: null,
                    data: {
                        requestId,
                        success: true,
                        message: msg
                        // 这里不再传递 ratingChanges，由下面的 contest_update 统一处理
                    }
                });

                // 2. 延迟 500ms 后广播比赛状态更新（包含 Rating 变动信息，生成第二条系统消息）
                setTimeout(() => {
                    ctx.app.emit('broadcast', {
                        type: 'contest_update',
                        contestId: contestId,
                        status: 2,
                        ratingChanges: result.ratingChanges
                    });
                }, 500);
            }
        } catch (err) {
            logger.error(`voteContestAction: Finalize failed: ${err.message}`);
        }
    } else {
        // 更新投票进度
        ctx.app.emit('broadcast', {
            type: 'contest_action_update',
            contestId: contestId,
            targetTeam: currentAction.type === 'surrender' ? currentAction.requesterTeam : null,
            data: {
                requestId,
                currentVotes: voteCount
            }
        });
    }

    ctx.status = 200;
    ctx.body = { success: true };
}

// 辅助函数，复用 server.mjs 的逻辑
async function storeMessage(type, contestId, teamId, sender, message, mode) {
    await pool.query(
        'INSERT INTO contest_messages (type, contest_id, team_id, sender, message, mode) VALUES (?,?,?,?,?,?)',
        [type, contestId, teamId, sender, message, mode]
    );
}

export default {
    'POST /contest/request_action': requestContestAction,
    'POST /contest/vote_action': voteContestAction
};
