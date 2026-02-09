import pool from '../db.mjs';
import logger from '../logger.mjs';

async function health(ctx, next) {
    logger.debug(`health: Checking service health status`);

    const uptime = process.uptime();
    const timestamp = new Date().toISOString();

    const [rowsUser] = await pool.execute('SELECT COUNT(*) AS userCount FROM user');
    const [rowsContest] = await pool.execute('SELECT COUNT(*) AS contestCount FROM contest WHERE status = 1');
    const [rowsRoom] = await pool.execute('SELECT COUNT(*) AS roomCount FROM room');
    const [rowsSubmission] = await pool.execute('SELECT COUNT(*) AS submissionCount FROM contest_submissions');

    ctx.status = 200;
    ctx.body = {
        status: 'ok',
        uptime: uptime,
        timestamp: timestamp,
        userCount: rowsUser[0].userCount,
        contestCount: rowsContest[0].contestCount,
        roomCount: rowsRoom[0].roomCount,
        submissionCount: rowsSubmission[0].submissionCount
    };
};

export default {
    'GET /health': health
}