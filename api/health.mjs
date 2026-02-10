import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 服务健康检查接口
 * 返回系统运行时间、统计数据等
 *
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function health(ctx) {
    logger.debug('health: 正在检查服务健康状态');

    const uptime = process.uptime();
    const timestamp = new Date().toISOString();

    try {
        const [[rowsUser], [rowsContest], [rowsRoom], [rowsSubmission]] = await Promise.all([
            pool.execute('SELECT COUNT(*) AS userCount FROM user'),
            pool.execute('SELECT COUNT(*) AS contestCount FROM contest WHERE status = 1'),
            pool.execute('SELECT COUNT(*) AS roomCount FROM room'),
            pool.execute('SELECT COUNT(*) AS submissionCount FROM contest_submissions')
        ]);

        ctx.status = 200;
        ctx.body = {
            success: true,
            data: {
                status: 'ok',
                uptime: uptime,
                timestamp: timestamp,
                userCount: rowsUser[0].userCount,
                contestCount: rowsContest[0].contestCount,
                roomCount: rowsRoom[0].roomCount,
                submissionCount: rowsSubmission[0].submissionCount
            }
        };
    } catch (error) {
        logger.error(`health: 获取健康状态时发生错误: ${error.message}`);
        ctx.status = 500;
        ctx.body = {
            success: false,
            message: '服务器内部错误'
        };
    }
}

export default {
    'GET /health': health
}