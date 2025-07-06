// atAvator.mjs
import * as cheerio from 'cheerio';
import https from 'https';

async function atAvator(ctx, next) {
    const username = ctx.params.username;
    if (!username) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'Username is required' };
        return;
    }
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
        let img = $('#main-div #main-container div .avator').attr('src');

        if (img === '') {
            img.status = 404;
            ctx.body = 'Not Found';
        } else {
            ctx.status = 200;
            ctx.body = img;
        }
    } catch (error) {
        console.log(error);
        ctx.status = 500;
        ctx.body = 'Server Error';
    }
}

export default {
    'GET /atAvator/:username': atAvator
}
