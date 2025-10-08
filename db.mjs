import mysql from 'mysql2/promise';
import config from './config.mjs'
import logger from './logger.mjs';

let pool;

async function init() {
    try {
        pool = mysql.createPool({
            host: config.mysql.host,
            port: config.mysql.port,
            user: config.mysql.user,
            password: config.mysql.password,
            database: config.mysql.database,
            waitForConnections: true,
            connectionLimit: 1024, // 允许最大连接数
            queueLimit: 0
        });

        logger.info('db: 数据库连接池已创建');

        // 查询数据库是否存在
        let [databases] = await pool.execute('SHOW DATABASES');
        if (!databases.some(item => item['Database']?.toLowerCase() === 'atduel')) {
            await pool.execute('CREATE DATABASE atduel');
            logger.info("db: 成功创建数据库");
        }

        // 查询表是否存在
        let [tables] = await pool.execute('SHOW TABLES');
        const tableNames = tables.map(t => Object.values(t)[0]);

        const tableDefinitions = {
            user: `
                CREATE TABLE IF NOT EXISTS user (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(255) NOT NULL UNIQUE,
                    password VARCHAR(255) NOT NULL,
                    ATName VARCHAR(255),
                    avatar VARCHAR(255),
                    rating INT DEFAULT 0,
                    contest JSON
                )`,
            problem: `
                CREATE TABLE IF NOT EXISTS problem (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    url VARCHAR(255) NOT NULL,
                    difficulty INT NOT NULL
                )`,
            contest: `
                CREATE TABLE IF NOT EXISTS contest (
                    id INT PRIMARY KEY,
                    url VARCHAR(255) NOT NULL,
                    startTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    endTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    user JSON,
                    problem JSON,
                    submission JSON,
                    Rating JSON,
                    status INT DEFAULT 0,
                    scorea INT DEFAULT 0,
                    scoreb INT DEFAULT 0,
                    rated BOOLEAN DEFAULT false
                )`,
            login_status: `
                CREATE TABLE IF NOT EXISTS login_status (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(255) NOT NULL,
                    token VARCHAR(255) NOT NULL,
                    loginTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    rememberMe TINYINT DEFAULT 0
                )`,
            room: `
                CREATE TABLE IF NOT EXISTS room (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    url VARCHAR(255) NOT NULL,
                    master VARCHAR(255) NOT NULL,
                    user JSON,
                    setting JSON,
                    rated BOOLEAN DEFAULT false,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
            contest_messages: `
                CREATE TABLE IF NOT EXISTS contest_messages (
                    id SERIAL PRIMARY KEY,
                    type VARCHAR(30) NOT NULL,
                    contest_id VARCHAR(50) NOT NULL,
                    team_id VARCHAR(50),
                    sender VARCHAR(50) NOT NULL,
                    message TEXT NOT NULL,
                    mode VARCHAR(10) NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
            user_ban: `
                CREATE TABLE IF NOT EXISTS user_ban (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) NOT NULL,
                    startBanTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    endBanTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    reason TEXT
                )`,
            ip_ban: `
                CREATE TABLE IF NOT EXISTS ip_ban (
                    id SERIAL PRIMARY KEY,
                    ip VARCHAR(255) NOT NULL,
                    startBanTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    endBanTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    reason TEXT
                )`,
            admin_status: `
                CREATE TABLE IF NOT EXISTS admin_status (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    token VARCHAR(255) NOT NULL,
                    loginTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
        };

        for (const [tableName, createSQL] of Object.entries(tableDefinitions)) {
            if (!tableNames.includes(tableName)) {
                await pool.execute(createSQL);
                logger.info(`db: 成功创建表 ${tableName}`);
            } else {
                logger.debug(`db: 表 ${tableName} 已存在`);
            }
        }

        logger.info('db: 数据库初始化完成');
        return pool; // 返回连接池对象
    } catch (err) {
        logger.error('db: 数据库初始化失败:', err.stack);
        return null;
    }
}

// 初始化数据库
(async () => {
    await init();
})();

// 导出连接池
export default pool;
