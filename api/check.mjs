// check.mjs
import * as cheerio from 'cheerio';
import axios from 'axios';
import logger from '../logger.mjs';

/**
 * 获取 AtCoder 用户所属机构
 * 
 * @param {string} username - AtCoder 用户名
 * @returns {Promise<string|null>} 机构信息或 null
 */
async function getAffiliationValue(username) {
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
        let affiliation = null;

        $('.dl-table tr').each((_, element) => {
            const label = $(element).find('th').text().trim();
            if (label === 'Affiliation') {
                affiliation = $(element).find('td').text().trim();
                return false;
            }
        });

        return affiliation;
    } catch (error) {
        logger.error(`getAffiliationValue 错误: 获取用户 ${username} 的 AtCoder 机构信息失败: ${error.message}`);
        return null;
    }
}

/**
 * 获取 AtCoder 用户所属机构接口
 * 用于注册时验证用户身份（通过检查 AtCoder 个人主页的 Affiliation 字段）
 * 
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function check(ctx) {
    const { username } = ctx.params;

    if (!username) {
        ctx.status = 400;
        ctx.body = { success: false, message: '用户名不能为空' };
        return;
    }

    logger.debug(`check: 正在获取 AtCoder 用户机构信息: ${username}`);
    const affiliation = await getAffiliationValue(username);

    if (affiliation === null) {
        logger.debug(`check: 未找到用户 ${username} 的机构信息或请求失败`);
        ctx.status = 404;
        ctx.body = { success: false, message: '未找到机构信息或 AtCoder 用户不存在' };
    } else {
        logger.info(`check: 找到 ${username} 的机构信息: ${affiliation}`);
        ctx.status = 200;
        ctx.body = { success: true, data: affiliation };
    }
}

export { getAffiliationValue };
export default {
    'GET /check/:username': check
}
