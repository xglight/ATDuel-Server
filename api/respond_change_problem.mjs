// respond_change_problem.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';
import requestStore from '../tools/change_request_store.mjs';
import { verifyUser } from '../utils/auth.mjs';

/**
 * 获取房间内所有人 AC 过的题目集合
 * 
 * @param {Array} usernames - 用户列表
 * @returns {Promise<Set>} AC 过的题目集合
 */
async function getAcceptedProblems(usernames) {
    if (!usernames || usernames.length === 0) return new Set();
    try {
        const [rows] = await pool.execute(
            'SELECT DISTINCT problem_id FROM user_problem_accept WHERE username IN (?)',
            [usernames]
        );
        return new Set(rows.map(row => row.problem_id));
    } catch (err) {
        logger.error(`respond_change_problem: getAcceptedProblems: 获取 AC 记录失败: ${err.message}`);
        return new Set();
    }
}

/**
 * 处理换题请求 (接受/拒绝)
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function respondChangeProblem(ctx) {
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
        logger.debug(`respond_change_problem: 用户 ${username} 正在处理比赛 ${contestId} 中的换题请求 ${requestId}, 操作: ${action}`);

        // 获取当前请求
        const currentRequest = requestStore.get(contestId);
        if (!currentRequest || currentRequest.requestId !== requestId) {
            ctx.body = { success: false, message: '请求已过期或不存在' };
            return;
        }

        // 并行获取比赛 ID 和用户队伍信息
        const [contestRows] = await pool.execute('SELECT id FROM contest WHERE url = ?', [contestId]);
        if (contestRows.length === 0) {
            ctx.body = { success: false, message: '比赛不存在' };
            return;
        }
        const dbContestId = contestRows[0].id;

        const [teamRows] = await pool.execute(
            'SELECT team_label FROM contest_teams WHERE contest_id = ? AND username = ?',
            [dbContestId, username]
        );

        if (teamRows.length === 0) {
            ctx.body = { success: false, message: '您不是该比赛的参赛者' };
            return;
        }
        const responderTeam = teamRows[0].team_label;

        if (responderTeam === currentRequest.requesterTeam) {
            ctx.body = { success: false, message: '您不能处理本队的请求' };
            return;
        }

        // 处理请求
        if (action === 'reject') {
            requestStore.clear(contestId);
            logger.info(`respond_change_problem: 用户 ${username} 拒绝了比赛 ${contestId} 中的换题请求`);

            // 广播拒绝消息
            ctx.app.emit('broadcast', {
                type: 'change_problem_result',
                contestId: contestId,
                data: {
                    requestId,
                    success: false,
                    reason: 'rejected',
                    message: `换题请求被拒绝`
                }
            });

            ctx.body = { success: true, message: '响应处理成功' };
            return;
        } else if (action === 'accept') {
            // 执行换题逻辑
            const problemId = currentRequest.problemId;

            // 再次检查题目状态
            const [problemRows] = await pool.execute(
                'SELECT title, difficulty, status FROM contest_problems WHERE contest_id = ? AND problem_id = ?',
                [dbContestId, problemId]
            );

            if (problemRows.length === 0 || problemRows[0].status === 1) {
                requestStore.clear(contestId);
                ctx.body = { success: false, message: '题目状态已变更，无法更换' };
                return;
            }
            const currentProblem = problemRows[0];

            // 并行获取参与者和已存在题目
            const [[participants], [existingProblems]] = await Promise.all([
                pool.execute('SELECT username FROM contest_participants WHERE contest_id = ?', [dbContestId]),
                pool.execute('SELECT problem_id FROM contest_problems WHERE contest_id = ?', [dbContestId])
            ]);

            const allUsernames = participants.map(p => p.username);
            const acceptedProblems = await getAcceptedProblems(allUsernames);
            const existingProblemIds = new Set(existingProblems.map(p => p.problem_id));

            const targetDiff = currentProblem.difficulty;
            const [allProblems] = await pool.execute(
                'SELECT id, title, url, difficulty FROM problem WHERE difficulty BETWEEN ? AND ?',
                [targetDiff - 200, targetDiff + 200]
            );

            const filteredProblems = allProblems.filter(p => {
                const isAHC = p.title.toLowerCase().includes('ahc');
                const taskId = p.url.split('/').pop();
                const isAccepted = acceptedProblems.has(taskId);
                const isAlreadyInContest = existingProblemIds.has(p.id);
                return !isAHC && !isAccepted && !isAlreadyInContest;
            });

            if (filteredProblems.length === 0) {
                requestStore.clear(contestId);
                ctx.body = { success: false, message: '在该难度范围内找不到合适的替换题目' };
                // 广播失败
                ctx.app.emit('broadcast', {
                    type: 'change_problem_result',
                    contestId: contestId,
                    data: {
                        requestId,
                        success: false,
                        reason: 'error',
                        message: '换题失败：找不到合适的题目'
                    }
                });
                return;
            }

            // 随机选择
            filteredProblems.sort((a, b) => Math.abs(a.difficulty - targetDiff) - Math.abs(b.difficulty - targetDiff));
            const topCandidates = filteredProblems.slice(0, 10);
            const selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];

            // 更新数据库
            await pool.execute(
                'UPDATE contest_problems SET problem_id = ?, title = ?, url = ?, difficulty = ? WHERE contest_id = ? AND problem_id = ?',
                [selected.id, selected.title, selected.url, selected.difficulty, dbContestId, problemId]
            );

            logger.info(`respond_change_problem: 用户 ${username} 接受了请求。将题目 ${problemId} 替换为 ${selected.id}`);

            // 清除请求
            requestStore.clear(contestId);

            // 广播成功消息
            ctx.app.emit('broadcast', {
                type: 'contest_update',
                contestId: contestId,
                action: 'problem_changed'
            });

            ctx.app.emit('broadcast', {
                type: 'change_problem_result',
                contestId: contestId,
                data: {
                    requestId,
                    success: true,
                    reason: 'accepted',
                    message: `换题请求已通过，题目已更新`
                }
            });

            ctx.body = { success: true, message: '响应处理成功' };
        } else {
            ctx.body = { success: false, message: '无效的操作' };
        }
    } catch (err) {
        logger.error(`respond_change_problem 错误: ${err.message}`);
        requestStore.clear(contestId);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'POST /respond_change_problem': respondChangeProblem
};
