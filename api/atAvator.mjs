// atavatar.mjs
import * as cheerio from 'cheerio';
import https from 'https';

async function atavatar(ctx, next) {
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

        let img = $('#main-div #main-container div .avatar').attr('src');

        if (img === '' || img === undefined) {
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
    'GET /atavatar/:username': atavatar
}
