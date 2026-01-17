import config from '../config.mjs';
import logger from '../logger.mjs';

/**
 * 获取公开配置信息的接口
 * @param {object} ctx Koa 上下文
 */
async function getConfig(ctx) {
    logger.debug(`api/config: Fetching public configuration`);

    ctx.status = 200;
    ctx.body = {
        register: config.register,
        content: config.content,
        server: {
            apiPrefix: config.server.apiPrefix
        }
    };
}

export default {
    'GET /config': getConfig
};
