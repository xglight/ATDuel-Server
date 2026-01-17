// atRating.mjs
import * as cheerio from 'cheerio';
import https from 'https';
import logger from '../logger.mjs';

async function atRating(ctx, next) {
    const username = ctx.params.username;
    if (!username) {
        ctx.status = 400;
        ctx.type = 'text/plain';
        ctx.body = "username is required";
        return;
    }
    const url = 'https://atcoder.jp/users/' + username;
    logger.debug('atRating: Requesting ATRating: ', url);
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
                logger.error('atRating: Network error: ', error);
                reject(error);
            });
        });

        const $ = cheerio.load(data);
        let rating = '';
        $('#main-div #main-container div [class="dl-table mt-2"] tr').each((index, element) => {
            if ($(element).find('th').text() === 'Rating') {
                rating = $(element).find('td').find('span').text();
                return false;
            }
        });

        ctx.type = 'text/plain';

        if (rating == '') {
            ctx.status = 404;
            ctx.body = 'Not Found';
        } else {
            ctx.status = 200;
            ctx.body = rating;
        }
    } catch (error) {
        logger.error('atRating: Processing error: ', error);
        ctx.status = 500;
        ctx.type = 'text/plain';
        ctx.body = 'Server Error';
    }
}

export default {
    'GET /atRating/:username': atRating
}
