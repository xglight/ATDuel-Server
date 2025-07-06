// check.mjs
import * as cheerio from 'cheerio';
import https from 'https';

async function check(ctx, next) {
    const username = ctx.params.username;
    console.log('check-username:', username);
    const url = 'https://atcoder.jp/users/' + username;

    ctx.type = 'text/plain';
    try {
        const data = await new Promise((resolve, reject) => {
            https.get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    resolve(data);
                });
            }).on('error', (error) => {
                console.log(error);
                reject(error);
            });
        });

        const $ = cheerio.load(data);
        let affiliation = '';
        $('#main-div #main-container div .dl-table tr').each((index, element) => {
            if ($(element).find('th').text() === 'Affiliation') {
                affiliation = $(element).find('td').text();
                return false;
            }
        });

        if (affiliation === '') {
            ctx.status = 404;
            ctx.body = 'Not Found';
        } else {
            ctx.status = 200;
            ctx.body = affiliation;
        }
    } catch (error) {
        console.log(error);
        ctx.status = 500;
        ctx.body = 'Server Error';
    }
}

export default {
    'GET /check/:username': check
}
