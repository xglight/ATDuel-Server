import mysql from 'mysql2/promise';
import config from './config.mjs'
import logger from './logger.mjs';
import { tableDefinitions } from './table_definitions.mjs';

let pool;

/**
 * 初始化并验证数据库连接
 */
async function init() {
    try {
        pool = mysql.createPool({
            host: config.mysql.host,
            port: config.mysql.port,
            user: config.mysql.user,
            password: config.mysql.password,
            database: config.mysql.database,
            waitForConnections: true,
            connectionLimit: 1024,
            queueLimit: 0
        });

        logger.info('db: Database connection pool created');

        // 1. 验证数据库是否存在
        try {
            await pool.execute('SELECT 1');
        } catch (err) {
            if (err.code === 'ER_BAD_DB_ERROR') {
                logger.fatal(`db: Database "${config.mysql.database}" does not exist. Please run "npm run init" first.`);
            } else {
                logger.fatal(`db: Database connection failed: ${err.message}`);
            }
            process.exit(1);
        }

        // 2. 验证所有表是否存在
        const [tables] = await pool.execute('SHOW TABLES');
        const tableNamesInDb = tables.map(t => Object.values(t)[0].toLowerCase());
        const missingTables = [];

        for (const tableName of Object.keys(tableDefinitions)) {
            if (!tableNamesInDb.includes(tableName.toLowerCase())) {
                missingTables.push(tableName);
            }
        }

        if (missingTables.length > 0) {
            logger.fatal(`db: Missing tables: ${missingTables.join(', ')}. Please run "npm run init" to fix.`);
            process.exit(1);
        }

        logger.info('db: Database validation completed');
        return pool;
    } catch (err) {
        logger.fatal('db: Critical error during database initialization:', err.stack);
        process.exit(1);
    }
}

// 立即初始化
(async () => {
    await init();
})();

export default pool;
