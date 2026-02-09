#!/usr/bin/env node
/**
 * @file ATDuel CLI 工具
 * 用法: node tools/cli.mjs <category> <command> [args]
 * 示例: node tools/cli.mjs admin set admin123
 */
import readline from 'readline';
import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';
import config from '../config.mjs';
import { tableDefinitions } from '../table_definitions.mjs';
// 移除顶层导入，避免在初始化时触发 db.mjs 的自动检查
// import problem from './problem.mjs';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/**
 * 提问函数
 * @param {string} query 提示文本
 * @returns {Promise<string>} 用户输入
 */
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

/**
 * 获取数据库连接
 * @param {boolean} useDb 是否指定使用配置中的数据库
 */
async function getConnection(useDb = true) {
    const connConfig = {
        host: config.mysql.host,
        port: config.mysql.port,
        user: config.mysql.user,
        password: config.mysql.password
    };
    if (useDb) {
        connConfig.database = config.mysql.database;
    }
    return await mysql.createConnection(connConfig);
}

/**
 * 管理员相关命令
 */
const adminCommands = {
    /**
     * 设置/更新管理员密码
     * @param {string[]} args 参数 [username]
     */
    async setPassword(args) {
        let username = args[0];
        if (!username) {
            username = await question('请输入要修改密码的管理员用户名 (默认: admin): ') || 'admin';
        }

        const password = await question(`请输入管理员 "${username}" 的新密码: `);
        if (!password) {
            console.error('错误: 密码不能为空！');
            return;
        }

        let connection;
        try {
            connection = await getConnection();
            const hashedPassword = await bcrypt.hash(password, 10);

            const [existing] = await connection.execute('SELECT id FROM admins WHERE username = ?', [username]);

            if (existing.length > 0) {
                await connection.execute('UPDATE admins SET password = ? WHERE username = ?', [hashedPassword, username]);
                console.log(`\n成功: 管理员 "${username}" 密码已更新。`);
            } else {
                console.log(`\n错误: 未找到管理员 "${username}"。`);
            }
        } catch (err) {
            console.error('\n操作失败:', err.message);
        } finally {
            if (connection) await connection.end();
        }
    },

    /**
     * 修改管理员用户名
     * @param {string[]} args 参数 [oldUsername, newUsername]
     */
    async setUsername(args) {
        let oldUsername = args[0];
        let newUsername = args[1];

        if (!oldUsername) {
            oldUsername = await question('请输入原用户名: ');
        }
        if (!newUsername) {
            newUsername = await question('请输入新用户名: ');
        }

        if (!oldUsername || !newUsername) {
            console.error('错误: 原用户名和新用户名均不能为空！');
            return;
        }

        let connection;
        try {
            connection = await getConnection();
            const [existing] = await connection.execute('SELECT id FROM admins WHERE username = ?', [oldUsername]);

            if (existing.length === 0) {
                console.error(`错误: 未找到管理员 "${oldUsername}"`);
                return;
            }

            await connection.execute('UPDATE admins SET username = ? WHERE username = ?', [newUsername, oldUsername]);
            console.log(`\n成功: 管理员用户名已从 "${oldUsername}" 修改为 "${newUsername}"。`);
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                console.error(`错误: 用户名 "${newUsername}" 已被占用。`);
            } else {
                console.error('\n操作失败:', err.message);
            }
        } finally {
            if (connection) await connection.end();
        }
    },

    /**
     * 创建新管理员
     * @param {string[]} args 参数 [username]
     */
    async add(args) {
        let username = args[0];
        if (!username) {
            username = await question('请输入新管理员用户名: ');
        }
        if (!username) {
            console.error('错误: 用户名不能为空！');
            return;
        }

        const password = await question(`请输入管理员 "${username}" 的密码: `);
        if (!password) {
            console.error('错误: 密码不能为空！');
            return;
        }

        let connection;
        try {
            connection = await getConnection();
            const hashedPassword = await bcrypt.hash(password, 10);
            await connection.execute('INSERT INTO admins (username, password) VALUES (?, ?)', [username, hashedPassword]);
            console.log(`\n成功: 管理员 "${username}" 已创建。`);
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                console.error(`错误: 管理员 "${username}" 已存在。`);
            } else {
                console.error('\n操作失败:', err.message);
            }
        } finally {
            if (connection) await connection.end();
        }
    },

    /**
     * 列出所有管理员
     */
    async list() {
        let connection;
        try {
            connection = await getConnection();
            const [rows] = await connection.execute('SELECT username, created_at FROM admins');
            console.log('\n=== 管理员列表 ===');
            if (rows.length === 0) {
                console.log('(暂无管理员)');
            } else {
                rows.forEach(row => {
                    console.log(`- ${row.username} (创建时间: ${row.created_at})`);
                });
            }
        } catch (err) {
            console.error('\n操作失败:', err.message);
        } finally {
            if (connection) await connection.end();
        }
    }
};

/**
 * 数据库命令
 */
const databaseCommands = {
    async init(args) {
        console.log('\n=== ATDuel 数据库初始化 ===');

        let connection;
        try {
            connection = await getConnection(false);
            const dbName = config.mysql.database;

            // 检查数据库
            const [databases] = await connection.query('SHOW DATABASES LIKE ?', [dbName]);
            let dbDropped = false;

            if (databases.length > 0) {
                console.log(`\n警告: 数据库 "${dbName}" 已经存在。`);
                const confirm = await question(`要删除并重新创建数据库 "${dbName}" 吗？(yes/no): `);
                if (confirm.toLowerCase() === 'yes') {
                    await connection.query(`DROP DATABASE \`${dbName}\``);
                    dbDropped = true;
                }
            }

            await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
            await connection.query(`USE \`${dbName}\``);

            // 检查表
            let forceOverwriteTables = false;
            if (!dbDropped) {
                const [tables] = await connection.query('SHOW TABLES');
                if (tables.length > 0) {
                    const confirm = await question(`发现已存在 ${tables.length} 个表，是否强制覆盖？(yes/no): `);
                    if (confirm.toLowerCase() === 'yes') forceOverwriteTables = true;
                }
            }

            for (const [tableName, createSQL] of Object.entries(tableDefinitions)) {
                if (forceOverwriteTables) await connection.query(`DROP TABLE IF EXISTS \`${tableName}\``);
                await connection.query(createSQL);
                console.log(`表 "${tableName}" 已就绪`);
            }

            console.log('\n数据库初始化完成。');

        } catch (err) {
            console.error('\n初始化失败:', err.message);
        } finally {
            if (connection) await connection.end();
        }
    }
}

/**
 * 题目命令
 */
const problemCommands = {
    /**
     * 更新题目信息
     */
    async update() {
        console.log('\n=== ATDuel 题目更新 ===\n');
        console.log('当前的题目更新依赖 Clist 的 API，请确保 API 密钥正确。');
        await new Promise(resolve => setTimeout(resolve, 1000));
        let username = await question('请输入 Clist 用户名: ');
        let api_key = await question('请输入 Clist API 密钥: ');

        // 动态导入 problem 模块
        const problemModule = await import('./problem.mjs');
        const problem = problemModule.default;
        await problem.update(username, api_key);
    }
}

/**
 * 初始化命令
 */
async function handleInit() {
    console.log('\n=== ATDuel 数据库初始化 ===');

    let connection;
    try {
        connection = await getConnection(false);
        const dbName = config.mysql.database;

        // 检查数据库
        const [databases] = await connection.query('SHOW DATABASES LIKE ?', [dbName]);
        let dbDropped = false;

        if (databases.length > 0) {
            console.log(`\n警告: 数据库 "${dbName}" 已经存在。`);
            const confirm = await question(`要删除并重新创建数据库 "${dbName}" 吗？(yes/no): `);
            if (confirm.toLowerCase() === 'yes') {
                await connection.query(`DROP DATABASE \`${dbName}\``);
                dbDropped = true;
            }
        }

        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await connection.query(`USE \`${dbName}\``);

        // 检查表
        let forceOverwriteTables = false;
        if (!dbDropped) {
            const [tables] = await connection.query('SHOW TABLES');
            if (tables.length > 0) {
                const confirm = await question(`发现已存在 ${tables.length} 个表，是否强制覆盖？(yes/no): `);
                if (confirm.toLowerCase() === 'yes') forceOverwriteTables = true;
            }
        }

        for (const [tableName, createSQL] of Object.entries(tableDefinitions)) {
            if (forceOverwriteTables) await connection.query(`DROP TABLE IF EXISTS \`${tableName}\``);
            await connection.query(createSQL);
            console.log(`表 "${tableName}" 已就绪`);
        }

        console.log('\n数据库初始化完成。');

        // 顺便设置管理员
        console.log('\n请设置初始管理员账号:');
        await adminCommands.add([]);

    } catch (err) {
        console.error('\n初始化失败:', err.message);
    } finally {
        if (connection) await connection.end();
    }
}



/**
 * 打印帮助信息
 */
function showHelp() {
    console.log(`
ATDuel CLI 工具
用法: npm run cli <command> [args]
      node tools/cli.mjs <command> [args]

命令列表:
  init                      初始化数据库、表和初始管理员
  database init             初始化数据库
  problem update            更新题目信息
  admin list                列出所有管理员
  admin add [username]      添加新管理员
  admin setPassword [user]  修改管理员密码
  admin setUsername [old] [new] 修改管理员用户名
    `);
}

/**
 * 主入口
 */
async function main() {
    const args = process.argv.slice(2);
    const cmd = args[0];

    switch (cmd) {
        case 'init':
            await handleInit();
            break;
        case 'database':
            if (databaseCommands[args[1]]) {
                await databaseCommands[args[1]](args.slice(2));
            } else {
                console.error(`未知 database 子命令: ${args[1] || ''}`);
                showHelp();
            }
            break;
        case 'problem':
            if (problemCommands[args[1]]) {
                await problemCommands[args[1]](args.slice(2));
            } else {
                console.error(`未知 problem 子命令: ${args[1] || ''}`);
                showHelp();
            }
            break;
        case 'admin':
            // 别名映射
            const alias = {
                'setAdminUsername': 'setUsername',
                'setAdminPassword': 'setPassword'
            };
            const targetCmd = alias[args[1]] || args[1];

            if (adminCommands[targetCmd]) {
                await adminCommands[targetCmd](args.slice(2));
            } else {
                console.error(`未知 admin 子命令: ${args[1] || ''}`);
                showHelp();
            }
            break;
        case 'help':
        case '--help':
        case '-h':
        default:
            if (cmd && cmd !== 'help') console.error(`未知命令: ${cmd}`);
            showHelp();
            break;
    }

    rl.close();
    process.exit(0);
}

main();
