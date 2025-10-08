import pool from '../db.mjs';
import logger from '../logger.mjs';

async function health(ctx, next) {
    logger.debug(`health: 检查服务健康状态`);

    const uptime = process.uptime();
    const timestamp = new Date().toISOString();

    const [rowsUser] = await pool.execute('SELECT COUNT(*) AS userCount FROM user');
    const [rowsContest] = await pool.execute('SELECT COUNT(*) AS contestCount FROM contest WHERE status = 0');
    const [rowsRoom] = await pool.execute('SELECT COUNT(*) AS roomCount FROM room');

    ctx.status = 200;
    ctx.body = {
        status: 'ok',
        uptime: uptime,
        timestamp: timestamp,
        userCount: rowsUser[0].userCount,
        contestCount: rowsContest[0].contestCount,
        roomCount: rowsRoom[0].roomCount
    };
};

export default {
    'GET /health': health
}