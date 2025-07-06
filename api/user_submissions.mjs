// user_submissions.mjs
import * as cheerio from 'cheerio';

async function getUserSubmission(ctx, next) {
    const { username, task } = ctx.request.body;
    let status = ctx.request.body.status;
    if (!username || !task) {
        ctx.status = 400;
        ctx.body = { error: '参数错误' };
        return;
    }
    if (!status) status = "";
    const contest = task.split('_').slice(0, -1).join('_').trim().replace(/_/g, '-');
    const url = "https://atcoder.jp/contests/" + contest + "/submissions?f.Task=" + task + "&f.LanguageName=&f.Status=" + status + "&f.User=" + username;
    console.log('url:', url);
    try {
        const response = await fetch(
            url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0',
                'Cookie': '_ga=GA1.1.300150255.1737274970; _ga_HLDXGWFW73=GS1.1.1739623543.1.1.1739623589.0.0.0; OJB_Session_ojb_updateL10nWebsiteJson_zh=true; timeDelta=-533; REVEL_FLASH=; _ga_RC512FD18N=GS2.1.s1746337962$o56$g1$t1746338778$j0$l0$h0; REVEL_SESSION=2a5bd8ec47b7b542fc1e4c72367701baae9a1b95-%00UserScreenName%3Axgshine%00%00UserName%3Axgshine%00%00a%3Afalse%00%00w%3Afalse%00%00_TS%3A1761890779%00%00csrf_token%3AhYj1t6YWa0LN%2Bm77lKYzy6lB6sMkPIwb7x8e%2Fs55Bi4%3D%00%00SessionKey%3Adf2e45017248c8fe8acd855a1285eb64e38c3a2ece47e82d42ea27b63d60bdfd%00',
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
            console.log(e);
            ctx.status = 500;
            ctx.body = { error: '服务器错误' };
            return;
        }
    } catch (e) {
        console.log(e);
        ctx.status = 500;
        ctx.body = { error: '服务器错误' };
        return;
    }
}

export default {
    'POST /user_submissions': getUserSubmission
}