// register.mjs
import pool from '../db.mjs';
import bcrypt from 'bcrypt';
import fs from 'fs';

async function register(ctx, next) {
    const { username, password, ATName } = ctx.request.body;

    if (!username || !password || !ATName) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'username, password and atcoder name cannot be empty' };
        return;
    }

    const config = await JSON.parse(fs.readFileSync('config.json', 'utf8'));

    try {
        const [rows] = await pool.execute('SELECT * FROM user WHERE username = ?', [username]);
        if (rows.length > 0) {
            ctx.status = 400;
            ctx.body = { success: false, message: 'username already exists' };
            return;
        }

        let rating = 0;
        let avator = '';

        try {
            const ratingText = await fetch(`http://10.0.3.113:3001/atRating/${ATName}`).then(res => res.text());
            rating = parseInt(ratingText) || 0;
        } catch (err) {
            console.error('register: 获取 rating 失败:', err.message);
        }

        if (rating < config.register.ratingLowerLimit) {
            ctx.status = 400;
            ctx.body = { success: false, message: 'rating at least' + config.register.ratingLowerLimit };
            return;
        }

        try {
            avator = await fetch(`http://10.0.3.113:3001/atAvator/${ATName}`).then(res => res.text());
        } catch (err) {
            console.error('register: 获取 avator 失败:', err.message);
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.execute(
            'INSERT INTO user (username, password, ATName, rating, avator) VALUES (?, ?, ?, ?, ?)',
            [username, hashedPassword, ATName, rating, avator]
        );

        console.log('register: 用户', username, '注册成功');
        ctx.body = { success: true, message: 'register success' };
        ctx.type = 'text/json';
    } catch (err) {
        console.error('register: username:', username, '查询/插入出错:', err.stack);
        ctx.status = 500;
        ctx.type = 'text/json';
        ctx.body = { success: false, message: 'Server Error' };
    }
}

export default {
    'POST /register': register
};
