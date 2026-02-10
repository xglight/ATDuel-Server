// atAvator.mjs
import * as cheerio from 'cheerio';
import axios from 'axios';
import logger from '../logger.mjs';

/**
 * 核心逻辑：获取 AtCoder 用户头像路径
 * 
 * @param {string} username - AtCoder 用户名
 * @returns {Promise<string|null>} 头像路径或 null
 */
async function getAtAvatarPath(username) {
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
        return $('#main-div #main-container div .avatar').attr('src') || null;
    } catch (error) {
        logger.error(`getAtAvatarPath 错误: 获取用户 ${username} 的头像失败: ${error.message}`);
        return null;
    }
}

/**
 * 获取 AtCoder 用户头像接口
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function atAvatar(ctx) {
    const { username } = ctx.params;
    if (!username) {
        ctx.status = 400;
        ctx.body = { success: false, message: '用户名不能为空' };
        return;
    }

    logger.debug(`atAvatar: 正在请求用户 ${username} 的头像`);
    const img = await getAtAvatarPath(username);

    if (!img) {
        ctx.status = 404;
        ctx.body = { success: false, message: '未找到头像' };
    } else {
        ctx.status = 200;
        ctx.body = { success: true, data: img };
    }
}

export { getAtAvatarPath };
export default {
    'GET /atavatar/:username': atAvatar
};
