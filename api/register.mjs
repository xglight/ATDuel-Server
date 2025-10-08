// register.mjs
import pool from '../db.mjs';
import bcrypt from 'bcrypt';
import config from '../config.mjs';
import logger from '../logger.mjs';

async function register(ctx, next) {
    const { username, password, ATName } = ctx.request.body;

    if (!username || !password || !ATName) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'username, password and atcoder name cannot be empty' };
        return;
    }

    logger.debug(`register: 注册用户 ${username}`);

    try {
        const [rows] = await pool.execute('SELECT * FROM user WHERE username = ?', [username]);
        if (rows.length > 0) {
            ctx.status = 400;
            ctx.body = { success: false, message: 'username already exists' };
            return;
        }

        const [atnameRows] = await pool.execute('SELECT * FROM user WHERE ATName = ?', [ATName]);
        if (atnameRows.length > 0) {
            ctx.status = 400;
            ctx.body = { success: false, message: 'atcoder name already exists' };
            return;
        }

        let rating = 0;
        let avatar = '';

        try {
            const ratingText = await fetch(config.buildApiUrl(`/atRating/${ATName}`)).then(res => res.text());
            rating = parseInt(ratingText) || 0;
        } catch (err) {
            logger.error('register: 获取 rating 失败:', err.message);
        }

        if (rating < config.register.ratingLowerLimit) {
            ctx.status = 400;
            ctx.body = { success: false, message: 'rating at least' + config.register.ratingLowerLimit };
            return;
        }

        try {
            avatar = await fetch(config.buildApiUrl(`/atavatar/${ATName}`)).then(res => res.text());
        } catch (err) {
            logger.error('register: 获取 avatar 失败:', err.message);
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.execute(
            'INSERT INTO user (username, password, ATName, rating, avatar) VALUES (?, ?, ?, ?, ?)',
            [username, hashedPassword, ATName, rating, avatar]
        );

        logger.info(`register: 用户 ${username} 注册成功`);

        ctx.body = { success: true, message: 'register success' };
        ctx.type = 'text/json';
    } catch (err) {
        logger.error(`register: 用户 ${username} 注册失败: ${err.message}`);
        ctx.status = 500;
        ctx.type = 'text/json';
        ctx.body = { success: false, message: 'Server Error' };
    }
}

export default {
    'POST /register': register
};
