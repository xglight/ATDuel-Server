
import pool from '../db.mjs';
import axios from 'axios';
import logger from '../logger.mjs';

async function getProblem(url) {
    logger.info("Fetching data:", url);
    try {
        const response = await axios.get(url, {
            headers: {
                // 'Authorization': 'ApiKey xglight: 252fbd43aaddf8a04fcbe72b6855c9feb686efa8',
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
            const difficulty = problem.rating == null ? -1 : problem.rating;
            if (rows.length > 0) {
                logger.info("Data already exists, updating difficulty:", id, difficulty);
                await pool.execute('UPDATE problem SET difficulty = ? WHERE id = ?', [difficulty, id]);
                continue;
            }
            const problemurl = problem.url;
            const title = problemurl.split('/').pop() + ' - ' + problem.name;
            logger.info("Inserting data:", id, difficulty, problemurl, title);
            try {
                await pool.execute(
                    'INSERT INTO problem (id, difficulty, url, title) VALUES (?,?,?,?)'
                    , [id, difficulty, problemurl, title]);
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

async function main() {
    let url = "https://clist.by/api/v4/problem/?resource=atcoder.jp&format=json&username=xglight&api_key=252fbd43aaddf8a04fcbe72b6855c9feb686efa8&offset=1000";
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
main();

