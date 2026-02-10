import pool from '../db.mjs';
import logger from '../logger.mjs';

/**
 * 校验管理员权限
 * 
 * @param {string} token - 管理员 Token
 * @returns {Promise<boolean>} 是否校验通过
 */
export async function verifyAdmin(token) {
    if (!token) return false;
    try {
        const [rows] = await pool.execute(
            'SELECT loginTime FROM admin_status WHERE token = ? LIMIT 1',
            [token]
        );

        if (rows.length === 0) return false;

        const loginTime = new Date(rows[0].loginTime);
        const expireTime = 24 * 60 * 60 * 1000; // 24小时过期

        if (Date.now() - loginTime.getTime() < expireTime) {
            // 异步更新最后活跃时间
            pool.execute(
                'UPDATE admin_status SET loginTime = CURRENT_TIMESTAMP WHERE token = ?',
                [token]
            ).catch(err => logger.error(`verifyAdmin: 更新活跃时间失败: ${err.message}`));
            return true;
        } else {
            // 已过期，删除记录
            pool.execute('DELETE FROM admin_status WHERE token = ?', [token])
                .catch(err => logger.error(`verifyAdmin: 删除过期 Token 失败: ${err.message}`));
            return false;
        }
    } catch (err) {
        logger.error(`verifyAdmin: 鉴权检查失败: ${err.message}`);
        return false;
    }
}
