import config from '../config.mjs';
import logger from '../logger.mjs';

/**
 * 获取公开配置信息的接口
 *
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function getConfig(ctx) {
    logger.debug('api/config: 正在获取公开配置信息');

    ctx.status = 200;
    ctx.body = {
        success: true,
        data: {
            register: config.register,
            content: config.content,
            server: {
                apiPrefix: config.server.apiPrefix
            }
        }
    };
}

export default {
    'GET /config': getConfig
};
