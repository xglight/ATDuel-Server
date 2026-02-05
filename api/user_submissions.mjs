// user_submissions.mjs
import logger from '../logger.mjs';

async function getUserSubmission(ctx, next) {
    const { username, problem_id, startTime } = ctx.request.body;
    let status = ctx.request.body.status;
    if (!username || !problem_id || !startTime) {
        ctx.status = 400;
        ctx.body = { error: 'Invalid parameters' };
        return;
    }
    logger.debug(`user_submissions: Fetching submission records for user ${username} on problem_id ${problem_id}, startTime: ${startTime}`);
    if (!status) status = "";
    const url = `https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${username}&from_second=${new Date(startTime).getTime() / 1000}`
    try {
        const response = await fetch(
            url, {
            method: 'GET'
        }
        );
        const data = await response.json();
        let result = [];
        try {
            for (const sub of data) {
                if (sub.problem_id != problem_id) continue;
                let row = {
                    "time": new Date(sub.epoch_second * 1000).toLocaleString("zh-CN", { hour12: false }),
                    "username": username,
                    "language": sub.language,
                    "score": sub.point,
                    "status": sub.result,
                    "run_time": sub.execution_time
                }
                result.push(row);
            }
            ctx.type = "text/json";
            ctx.status = 200;
            ctx.body = JSON.stringify(result);
        } catch (e) {
            logger.error(`user_submissions: Failed to parse HTML: ${e.message}`);
            ctx.status = 500;
            ctx.body = { error: 'Server Error' };
            return;
        }
    } catch (e) {
        logger.error(`user_submissions: Failed to fetch submission records for user ${username} on problem_id ${problem_id}: ${e.message}`);
        ctx.status = 500;
        ctx.body = { error: 'Server Error' };
        return;
    }
}

export default {
    'POST /user_submissions': getUserSubmission
}