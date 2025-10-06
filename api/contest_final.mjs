// contest_final.mjs
import pool from '../db.mjs';

async function contest_final(ctx, next) {
    const { contestId, team } = ctx.request.body;
    if (!contestId || !team) {
        ctx.status = 400;
        ctx.body = {
            message: 'contestId is required'
        };
        return;
    }

    logger.debug(`contest_final: 结束比赛: 比赛 ID ${contestId}, 队伍 ${team}`);

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [rows] = await conn.execute('SELECT * FROM contest WHERE url = ? FOR UPDATE', [contestId]);

        if (rows.length === 0) {
            ctx.status = 404;
            ctx.body = {
                message: 'contest not found'
            };
            await conn.rollback();
            return;
        }

        // Update contest status
        await conn.execute(
            'UPDATE contest SET status = 1 WHERE url = ?',
            [contestId]
        );

        // Broadcast contest update message
        ctx.app.emit('broadcast', {
            type: 'contest_update',
            contestId: contestId,
            action: 'end',
            data: {
                message: '比赛已结束',
                status: 1
            },
            timestamp: new Date().toISOString()
        });

        await conn.commit();

        ctx.status = 200;
        ctx.body = {
            message: 'contest finalized'
        };
    } catch (err) {
        logger.error(`contest_final: 结束比赛失败: ${err.message}`);
        if (conn) {
            await conn.rollback();
        }
        ctx.status = 500;
        ctx.body = {
            message: 'Internal server error'
        };
    } finally {
        if (conn) {
            conn.release();
        }
    }
}

export default {
    'POST /contest_final': contest_final
}
