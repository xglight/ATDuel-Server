// atRating.mjs
import * as cheerio from 'cheerio';
import axios from 'axios';
import logger from '../logger.mjs';

/**
 * 核心逻辑：获取 AtCoder 用户 Rating
 * 
 * @param {string} username - AtCoder 用户名
 * @returns {Promise<number|null>} Rating 或 null
 */
async function getAtRatingValue(username) {
    if (!username) return null;
    const url = `https://atcoder.jp/users/${username}`;
    try {
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        let rating = null;

        $('.dl-table tr').each((_, element) => {
            const label = $(element).find('th').text().trim();
            if (label === 'Rating') {
                const ratingText = $(element).find('td').find('span').first().text().trim();
                rating = parseInt(ratingText) || 0;
                return false;
            }
        });

        return rating;
    } catch (error) {
        logger.error(`getAtRatingValue 错误: 获取用户 ${username} 的 AtCoder Rating 失败: ${error.message}`);
        return null;
    }
}

/**
 * 获取 AtCoder 用户 Rating 接口
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function getAtRating(ctx) {
    const { username } = ctx.params;
    if (!username) {
        ctx.status = 400;
        ctx.body = { success: false, message: '用户名不能为空' };
        return;
    }

    logger.debug(`atRating: 正在请求用户 ${username} 的 AtCoder Rating`);
    const rating = await getAtRatingValue(username);

    if (rating === null) {
        ctx.status = 404;
        ctx.body = { success: false, message: '未找到该用户的 Rating' };
    } else {
        ctx.status = 200;
        ctx.body = { success: true, data: rating };
    }
}

export { getAtRatingValue };
export default {
    'GET /atRating/:username': getAtRating
};
