// api/request_change_problem.mjs
import pool from '../db.mjs';
import logger from '../logger.mjs';
import requestStore from '../tools/change_request_store.mjs';
import { v4 as uuidv4 } from 'uuid';

async function requestChangeProblem(ctx, next) {
    const { contestId, problemId, username, token } = ctx.request.body;

    if (!contestId || !problemId || !username || !token) {
        ctx.status = 200;
        ctx.body = { success: false, error: '参数无效' };
        return;
    }

    // 简单校验 Token (实际项目中建议用中间件统一校验)
    const [loginRows] = await pool.query('SELECT * FROM login_status WHERE username = ? AND token = ?', [username, token]);
    if (loginRows.length === 0) {
        ctx.status = 403;
        ctx.body = { success: false, error: '未登录或 Token 无效' };
        return;
    }

    // 检查比赛是否存在
    const [contestRows] = await pool.query('SELECT * FROM contest WHERE url = ?', [contestId]);
    if (contestRows.length === 0) {
        ctx.status = 200;
        ctx.body = { success: false, error: '比赛不存在' };
        return;
    }
    const contest = contestRows[0];
    const dbContestId = contest.id;

    if (contest.status === 2) {
        ctx.status = 200;
        ctx.body = { success: false, error: '比赛已结束' };
        return;
    }

    // 检查当前是否已有进行中的请求
    if (requestStore.get(contestId)) {
        ctx.status = 200;
        ctx.body = { success: false, error: '当前已有正在进行的换题请求，请稍后再试' };
        return;
    }

    // 获取用户队伍信息
    const [teamRows] = await pool.query('SELECT team_label FROM contest_teams WHERE contest_id = ? AND username = ?', [dbContestId, username]);
    if (teamRows.length === 0) {
        ctx.status = 200;
        ctx.body = { success: false, error: '您不是该比赛的参赛者' };
        return;
    }
    const userTeam = teamRows[0].team_label;

    // 获取题目信息
    const [problemRows] = await pool.query('SELECT * FROM contest_problems WHERE contest_id = ? AND problem_id = ?', [dbContestId, problemId]);
    if (problemRows.length === 0) {
        ctx.status = 200;
        ctx.body = { success: false, error: '题目不存在' };
        return;
    }
    const problem = problemRows[0];

    if (problem.status === 1) {
        ctx.status = 200;
        ctx.body = { success: false, error: '题目已被解决，无法更换' };
        return;
    }

    // 创建请求
    const requestId = uuidv4();
    const requestData = {
        requestId,
        problemId,
        problemTitle: problem.title,
        requesterTeam: userTeam,
        requesterName: username
    };

    // 设置超时回调
    const onExpire = (req) => {
        // 广播超时消息
        ctx.app.emit('broadcast', {
            type: 'change_problem_result',
            contestId: contestId,
            data: {
                requestId: req.requestId,
                success: false,
                reason: 'timeout',
                message: '换题请求已超时自动拒绝'
            }
        });
    };

    const newRequest = requestStore.create(contestId, requestData, onExpire);

    logger.debug(`request_change_problem: User ${username} (Team ${userTeam}) requested to change problem ${problemId} in contest ${contestId}`);

    // 广播请求消息
    ctx.app.emit('broadcast', {
        type: 'change_problem_request',
        contestId: contestId,
        data: {
            requestId: newRequest.requestId,
            problemId: newRequest.problemId,
            problemTitle: newRequest.problemTitle,
            requesterTeam: newRequest.requesterTeam,
            requesterName: newRequest.requesterName,
            expireAt: newRequest.expireAt
        }
    });

    ctx.status = 200;
    ctx.body = { success: true };
}

export default {
    'POST /request_change_problem': requestChangeProblem
};
