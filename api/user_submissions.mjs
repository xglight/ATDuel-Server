// user_submissions.mjs
import logger from '../logger.mjs';
import * as cheerio from 'cheerio';

function toOffsetString(date, offsetMinutes) {
    const pad = n => String(n).padStart(2, '0');
    const offset = (offsetMinutes >= 0 ? "+" : "-") +
        pad(Math.floor(Math.abs(offsetMinutes) / 60)) +
        pad(Math.abs(offsetMinutes) % 60);

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
        + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
        + offset;
}

async function getUserSubmissions(ctx, next) {
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
                    "time": toOffsetString(new Date(sub.epoch_second * 1000).toLocaleString("zh-CN", { hour12: false }), 8 * 60),
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

async function getUserSubmissions2(ctx, next) {
    const { username, problem_id, startTime } = ctx.request.body;
    let status = ctx.request.body.status;
    if (!username || !problem_id || !startTime) {
        ctx.status = 400;
        ctx.body = { error: 'Invalid parameters' };
        return;
    }
    logger.debug(`user_submissions: Fetching submission records for user ${username} on task ${problem_id}`);
    if (!status) status = "";
    const contest = problem_id.split('_').slice(0, -1).join('_').trim().replace(/_/g, '-');
    const url = "https://atcoder.jp/contests/" + contest + "/submissions?f.Task=" + problem_id + "&f.LanguageName=&f.Status=" + status + "&f.User=" + username;
    try {
        const response = await fetch(
            url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0',
                'Cookie': 'timeDelta=-810;REVEL_FLASH=;REVEL_SESSION=e1e92e896fb0471587bda765ac1659e079dee962-%00SessionKey%3Ae87f648ac2faf409f971852b2d9330af0fe3d5a69980fd93b4cd4f28a4febd46%00%00UserScreenName%3Axiaofu16191%00%00UserName%3Axiaofu16191%00%00a%3Afalse%00%00w%3Afalse%00%00csrf_token%3A%2FUmojZetD5dLhl5nGYCTsL4kXYKf3HFlFhih%2FthTeE8%3D%00%00_TS%3A1785844093%00;_ga=GA1.1.495292803.1760918025;_ga_RC512FD18N=GS2.1.s1770289300$o50$g1$t1770292091$j38$l0$h0;language=en;OJB_Session_ojb_updateL10nWebsiteJson_zh=true',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
            }
        }
        );
        const data = await response.text();
        const $ = cheerio.load(data);
        let result = [];
        try {
            $('.table-responsive').find('table').find('tbody').find('tr').each(function (index, element) {
                let row = {
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
        logger.error(`user_submissions: Failed to fetch submission records for user ${username} on task ${problem_id}: ${e.message}`);
        ctx.status = 500;
        ctx.body = { error: 'Server Error' };
        return;

    }
}

export default {
    'POST /user_submissions': getUserSubmissions2
}