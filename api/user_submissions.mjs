// user_submissions.mjs
import logger from '../logger.mjs';
import * as cheerio from 'cheerio';

/**
 * 格式化日期字符串，包含时区偏移
 * 
 * @param {Date} date - 日期对象
 * @param {number} offsetMinutes - 时区偏移（分钟）
 * @returns {string} 格式化后的字符串
 */
function toOffsetString(date, offsetMinutes) {
    const pad = n => String(n).padStart(2, '0');
    const offset = (offsetMinutes >= 0 ? "+" : "-") +
        pad(Math.floor(Math.abs(offsetMinutes) / 60)) +
        pad(Math.abs(offsetMinutes) % 60);

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
        + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
        + offset;
}

/**
 * 获取用户提交记录接口（通过 AtCoder 官网爬取）
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function getUserSubmissions(ctx) {
    const { username, problem_id, startTime, contest: contestName } = ctx.request.body;
    let { status } = ctx.request.body;

    if (!username || !problem_id || !startTime) {
        ctx.status = 400;
        ctx.body = { success: false, message: '参数无效，用户名、题目 ID 和开始时间均为必填' };
        return;
    }

    logger.debug(`user_submissions: 正在通过 API 获取用户 ${username} 在题目 ${problem_id} 上的提交记录 (开始时间: ${startTime})`);

    if (!status) status = "";
    const url = `https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${username}&from_second=${new Date(startTime).getTime() / 1000}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API 返回状态码 ${response.status}`);
        }
        const data = await response.json();
        const result = [];

        for (const sub of data) {
            if (sub.problem_id != problem_id) continue;
            // 如果提供了 contestName，验证题目所属比赛是否匹配
            if (contestName && sub.contest_id != contestName) continue;

            const subDate = new Date(sub.epoch_second * 1000);
            const row = {
                "time": toOffsetString(subDate, 8 * 60),
                "username": username,
                "language": sub.language,
                "score": sub.point,
                "status": sub.result,
                "run_time": sub.execution_time
            };
            result.push(row);
        }

        ctx.status = 200;
        ctx.body = { success: true, data: result };
    } catch (e) {
        logger.error(`user_submissions: 获取用户 ${username} 在题目 ${problem_id} 上的提交记录失败: ${e.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

/**
 * 获取用户提交记录接口（通过 AtCoder 官网爬取）
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function getUserSubmissions2(ctx) {
    const { username, problem_id, startTime, contest: contestName } = ctx.request.body;
    let { status } = ctx.request.body;

    if (!username || !problem_id || !startTime) {
        ctx.status = 400;
        ctx.body = { success: false, message: '参数无效，用户名、题目 ID 和开始时间均为必填' };
        return;
    }

    logger.debug(`user_submissions: 正在通过网页爬取用户 ${username} 在题目 ${problem_id} 上的提交记录`);

    if (!status) status = "";

    // 如果提供了 contestName，则直接使用；否则从 problem_id 中推导
    const contest = contestName || problem_id.split('_').slice(0, -1).join('_').trim().replace(/_/g, '-');
    const url = `https://atcoder.jp/contests/${contest}/submissions?f.Task=${problem_id}&f.LanguageName=&f.Status=${status}&f.User=${username}`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0',
                'Cookie': 'timeDelta=-810;REVEL_FLASH=;REVEL_SESSION=e1e92e896fb0471587bda765ac1659e079dee962-%00SessionKey%3Ae87f648ac2faf409f971852b2d9330af0fe3d5a69980fd93b4cd4f28a4febd46%00%00UserScreenName%3Axiaofu16191%00%00UserName%3Axiaofu16191%00%00a%3Afalse%00%00w%3Afalse%00%00csrf_token%3A%2FUmojZetD5dLhl5nGYCTsL4kXYKf3HFlFhih%2FthTeE8%3D%00%00_TS%3A1785844093%00;_ga=GA1.1.495292803.1760918025;_ga_RC512FD18N=GS2.1.s1770289300$o50$g1$t1770292091$j38$l0$h0;language=en;OJB_Session_ojb_updateL10nWebsiteJson_zh=true',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
            }
        });

        if (!response.ok) {
            throw new Error(`网页请求返回状态码 ${response.status}`);
        }

        const data = await response.text();
        const $ = cheerio.load(data);
        const result = [];

        $('.table-responsive').find('table').find('tbody').find('tr').each(function () {
            const row = {
                "time": $(this).find('time').text(),
                "username": $(this).find('a[href^="/users/"]').text(),
                "language": $(this).find('td').eq(3).find('a').text(),
                "score": $(this).find('[class~="text-right"][class~="submission-score"]').text(),
                "size": $(this).find('.text-right').eq(1).text(),
                "run_time": $(this).find('.text-right').eq(2).text(),
                "memory": $(this).find('.text-right').eq(3).text(),
                "status": $(this).find('span[data-placement="top"]').text()
            };
            result.push(row);
        });

        ctx.status = 200;
        ctx.body = { success: true, data: result };
    } catch (e) {
        logger.error(`user_submissions: 获取用户 ${username} 在题目 ${problem_id} 上的提交记录失败: ${e.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'POST /user_submissions': getUserSubmissions2
}