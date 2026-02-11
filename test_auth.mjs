
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

// 基础配置
const BASE_URL = 'http://localhost:3000/api'; // 请根据实际情况修改
const jar = new CookieJar();
const client = wrapper(axios.create({ baseURL: BASE_URL, jar }));

async function testAuthFlow() {
    console.log('--- 开始验证安全增强流程 ---');

    try {
        // 1. 尝试登录
        console.log('\n[1] 尝试登录...');
        const loginRes = await client.post('/login', {
            username: 'testuser', // 请确保数据库中有此用户
            password: btoa('testpassword'),
            rememberMe: 1
        });
        
        console.log('登录响应:', loginRes.data);
        const cookies = await jar.getCookies(BASE_URL);
        console.log('获取到的 Cookies:', cookies.map(c => `${c.key}=${c.value} (HttpOnly: ${c.httpOnly})`));

        // 检查 token 是否为 HttpOnly
        const tokenCookie = cookies.find(c => c.key === 'token');
        if (tokenCookie && tokenCookie.httpOnly) {
            console.log('✅ Token Cookie 是 HttpOnly 的');
        } else {
            console.log('❌ Token Cookie 不是 HttpOnly 的或未找到');
        }

        // 2. 测试 check_login
        console.log('\n[2] 测试 check_login (不带 body token)...');
        const checkRes = await client.post('/check_login');
        console.log('check_login 响应:', checkRes.data);
        if (checkRes.data.success && checkRes.data.data.username === 'testuser') {
            console.log('✅ check_login 验证成功且返回了用户名');
        } else {
            console.log('❌ check_login 验证失败');
        }

        // 3. 测试自动续期 (检查 Cookie 是否被重新设置)
        // 这一步在脚本中较难观察 max-age 的变化，但可以通过逻辑确认

        // 4. 测试退出登录
        console.log('\n[3] 测试登出...');
        const logoutRes = await client.post('/logout');
        console.log('登出响应:', logoutRes.data);
        
        const cookiesAfterLogout = await jar.getCookies(BASE_URL);
        const tokenAfterLogout = cookiesAfterLogout.find(c => c.key === 'token');
        if (!tokenAfterLogout || tokenAfterLogout.value === '') {
            console.log('✅ 登出后 Token 已清除');
        } else {
            console.log('❌ 登出后 Token 仍然存在');
        }

        console.log('\n--- 验证结束 ---');
    } catch (error) {
        console.error('验证过程中发生错误:', error.response?.data || error.message);
    }
}

// 注意：这个脚本需要服务器正在运行且数据库中有测试数据
// testAuthFlow();
console.log('测试脚本已就绪，请根据需要运行。');
