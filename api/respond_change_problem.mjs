// api/respond_change_problem.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';
import requestStore from '../tools/change_request_store.mjs';

/**
 * 获取房间内所有人 AC 过的题目集合
 * (复用自原 change_problem.mjs 逻辑)
 */
async function getAcceptedProblems(usernames) {
    if (!usernames || usernames.length === 0) return new Set();
    try {
        const [rows] = await pool.query(
            'SELECT DISTINCT problem_id FROM user_problem_accept WHERE username IN (?)',
            [usernames]
        );
        return new Set(rows.map(row => row.problem_id));
    } catch (err) {
        logger.error(`respond_change_problem: getAcceptedProblems: Failed to fetch AC records: ${err.message}`);
        return new Set();
    }
}

async function respondChangeProblem(ctx, next) {
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

    // 获取当前请求
    const currentRequest = requestStore.get(contestId);
    if (!currentRequest || currentRequest.requestId !== requestId) {
        ctx.status = 200;
        ctx.body = { success: false, error: '请求已过期或不存在' };
        return;
    }

    // 校验操作者身份（必须是对立队伍）
    const [contestRows] = await pool.query('SELECT id FROM contest WHERE url = ?', [contestId]);
    if (contestRows.length === 0) {
        ctx.status = 200;
        ctx.body = { success: false, error: '比赛不存在' };
        return;
    }
    const dbContestId = contestRows[0].id;

    const [teamRows] = await pool.query('SELECT team_label FROM contest_teams WHERE contest_id = ? AND username = ?', [dbContestId, username]);
    if (teamRows.length === 0) {
        ctx.status = 200;
        ctx.body = { success: false, error: '您不是该比赛的参赛者' };
        return;
    }
    const responderTeam = teamRows[0].team_label;

    if (responderTeam === currentRequest.requesterTeam) {
        ctx.status = 200;
        ctx.body = { success: false, error: '您不能处理本队的请求' };
        return;
    }

    // 处理请求
    if (action === 'reject') {
        requestStore.clear(contestId);
        logger.info(`respond_change_problem: User ${username} rejected change request in contest ${contestId}`);

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

        ctx.status = 200;
        ctx.body = { success: true };
        return;
    } else if (action === 'accept') {
        // 执行换题逻辑
        try {
            const problemId = currentRequest.problemId;

            // 再次检查题目状态
            const [problemRows] = await pool.query('SELECT * FROM contest_problems WHERE contest_id = ? AND problem_id = ?', [dbContestId, problemId]);
            if (problemRows.length === 0 || problemRows[0].status === 1) {
                requestStore.clear(contestId);
                ctx.status = 200;
                ctx.body = { success: false, error: '题目状态已变更，无法更换' };
                return;
            }
            const currentProblem = problemRows[0];

            // 筛选新题目
            const [participants] = await pool.query('SELECT username FROM contest_participants WHERE contest_id = ?', [dbContestId]);
            const allUsernames = participants.map(p => p.username);
            const acceptedProblems = await getAcceptedProblems(allUsernames);

            const [existingProblems] = await pool.query('SELECT problem_id FROM contest_problems WHERE contest_id = ?', [dbContestId]);
            const existingProblemIds = new Set(existingProblems.map(p => p.problem_id));

            const targetDiff = currentProblem.difficulty;
            const [allProblems] = await pool.execute('SELECT * FROM problem WHERE difficulty BETWEEN ? AND ?', [targetDiff - 200, targetDiff + 200]);

            const filteredProblems = allProblems.filter(p => {
                const isAHC = p.title.toLowerCase().includes('ahc');
                const taskId = p.url.split('/').pop();
                const isAccepted = acceptedProblems.has(taskId);
                const isAlreadyInContest = existingProblemIds.has(p.id);
                return !isAHC && !isAccepted && !isAlreadyInContest;
            });

            if (filteredProblems.length === 0) {
                requestStore.clear(contestId);
                ctx.status = 200;
                ctx.body = { success: false, error: '在该难度范围内找不到合适的替换题目' };
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
            await pool.query(
                'UPDATE contest_problems SET problem_id = ?, title = ?, url = ?, difficulty = ? WHERE contest_id = ? AND problem_id = ?',
                [selected.id, selected.title, selected.url, selected.difficulty, dbContestId, problemId]
            );

            logger.info(`respond_change_problem: User ${username} accepted request. Replaced problem ${problemId} with ${selected.id}`);

            // 清除请求
            requestStore.clear(contestId);

            // 广播成功消息 (包含两个动作：换题成功通知 + 结果通知)
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

            ctx.status = 200;
            ctx.body = { success: true };

        } catch (err) {
            logger.error(`respond_change_problem: Error: ${err.message}`);
            requestStore.clear(contestId);
            ctx.status = 500;
            ctx.body = { success: false, error: '服务器内部错误' };
        }
    } else {
        ctx.status = 200;
        ctx.body = { success: false, error: '无效的操作' };
    }
}

export default {
    'POST /respond_change_problem': respondChangeProblem
};
