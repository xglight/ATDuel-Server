
import pool from '../db.mjs';
import axios from 'axios';

async function getProblem(url) {
    console.log("获取数据:", url);
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
            if (rows.length > 0) {
                console.log("数据已存在:", id);
                continue;
            }
            const difficulty = problem.rating == null ? -1 : problem.rating;
            const problemurl = problem.url;
            const title = problemurl.split('/').pop() + ' - ' + problem.name;
            console.log("插入数据:", id, difficulty, problemurl, title);
            try {
                await pool.execute(
                    'INSERT INTO problem (id, difficulty, url, title) VALUES (?,?,?,?)'
                    , [id, difficulty, problemurl, title]);
            } catch (error) {
                console.error('插入数据失败:', error);
            }
        }
        return new_url;
    } catch (error) {
        console.error('API请求失败:', {
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
            console.log("已获取:", total, "次");
        }
        catch (error) {
            console.error('获取失败:', error);
            break;
        }
    }
}
main();

