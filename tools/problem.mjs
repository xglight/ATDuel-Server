
import readline from 'readline';
import pool from '../db.mjs';
import axios from 'axios';
import logger from '../logger.mjs';
import fs from 'fs/promises';

/**
 * 获取题目列表并更新数据库
 * @param {string} url - clist.by API 的 URL
 * @returns {Promise<string|number|null>} 返回下一页的 URL，或者 null 表示结束，-1 表示失败
 */
async function getProblem(url) {
    logger.info("Fetching data:", url);
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
                'Accept': 'application/json'
            }
        });
        const data = response.data;
        const new_url = data.meta.next;
        const problems = data.objects;
        for (let i = 0; i < problems.length; i++) {
            const problem = problems[i];
            const id = problem.id;
            const [rows] = await pool.execute('SELECT id FROM problem WHERE id = ?', [id]);
            const problemurl = problem.url;
            const name = problemurl.split('/').pop();
            const title = problemurl.split('/').pop() + ' - ' + problem.name;
            const difficulty = problemDifficulty[name]?.difficulty ?? -10000;
            if (difficulty == -10000) {
                logger.warn(`Difficulty not found for problem ${id}, name ${name}, url ${problemurl}`);
            }
            const contest = problemurl.replace('https://atcoder.jp/contests/', '').split('/')[0];
            if (rows.length > 0) {
                logger.info("Data already exists, updating difficulty and contest:", id, title, difficulty, contest);
                await pool.execute('UPDATE problem SET difficulty = ?, contest = ? WHERE id = ?', [difficulty, contest, id]);
                continue;
            }
            logger.info("Inserting data:", id, name, difficulty, problemurl, title, contest);
            try {
                await pool.execute(
                    'INSERT INTO problem (id, problem_id, difficulty, url, title, contest) VALUES (?,?,?,?,?,?)'
                    , [id, name, difficulty, problemurl, title, contest]);
            } catch (error) {
                logger.error('Failed to insert data:', error);
            }
        }
        return new_url;
    } catch (error) {
        logger.error('API request failed:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        return -1;
    }
}

let problemDifficulty = {};

/**
 * 初始化题目难度数据
 * 从 Kenkoooo API 获取 AtCoder 题目模型数据，并缓存到本地文件
 * @returns {Promise<number|void>} 成功返回 void，失败返回 -1
 */
async function initProblemDifficulty() {
    const url = "https://kenkoooo.com/atcoder/resources/problem-models.json";
    try {
        const response = await axios.get(url);
        problemDifficulty = response.data;
    } catch (error) {
        logger.error('API request failed:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        // 如果 API 失败，尝试从本地缓存读取
        try {
            const data = await fs.readFile('problem-models.json', 'utf-8');
            problemDifficulty = JSON.parse(data);
            logger.info("Loaded problem difficulty from local cache.");
        } catch (fsError) {
            logger.error('Failed to load difficulty from cache:', fsError.message);
            return -1;
        }
    }
}

/**
 * 主函数，同步题目数据
 * @param {string} username - clist.by 用户名
 * @param {string} api_key - clist.by API 密钥
 */
async function main(username, api_key) {
    await initProblemDifficulty();
    let url = "https://clist.by/api/v4/problem/?resource=atcoder.jp&format=json&username=" + username + "&api_key=" + api_key;
    let start_time = Date.now(), cnt = 0, total = 0;
    while (true) {
        if (Date.now() - start_time < 60000 && cnt > 10) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            continue;
        }
        if (Date.now() - start_time > 60000) {
            start_time = Date.now();
            cnt = 0;
        }
        try {
            const new_url = await getProblem(url);
            if (new_url == null) {
                logger.info("Fetch finished");
                break;
            }
            if (new_url == -1) {
                cnt = 11;
                continue;
            }
            url = "https://clist.by" + new_url;
            cnt++;
            total++;
            logger.info("Fetched:", total, "times");
        }
        catch (error) {
            logger.error('Fetch failed:', error);
            break;
        }
    }
}

export default {
    update: main
}

