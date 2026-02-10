/**
 * @file 日志管理模块
 * 提供多级别的日志记录功能，支持控制台彩色输出和文件持久化
 */
import config from './config.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 确保日志目录存在
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

/**
 * 生成带时间戳的日志文件名
 * @returns {string} 文件名
 */
const getLogFileName = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `server-${year}-${month}-${day}-${hours}-${minutes}-${seconds}.log`;
};

const logFile = path.join(logDir, getLogFileName());
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// 监听日志流错误
logStream.on('error', (err) => {
    console.error('Logger: Failed to write to log file:', err);
});

const levels = {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5
};

const currentLevel = levels[config.logLevel] !== undefined ? levels[config.logLevel] : 3;

const colors = {
    trace: '\x1b[90m', // 灰色
    debug: '\x1b[34m', // 蓝色
    info: '\x1b[32m',  // 绿色
    warn: '\x1b[33m',  // 黄色
    error: '\x1b[31m', // 红色
    fatal: '\x1b[35m', // 紫色
    reset: '\x1b[0m'
};

/**
 * 格式化参数为字符串
 * @param {any} arg - 参数
 * @returns {string}
 */
function formatArg(arg) {
    if (arg instanceof Error) {
        return arg.stack || arg.message;
    }
    if (typeof arg === 'object' && arg !== null) {
        try {
            return JSON.stringify(arg, null, 2);
        } catch (e) {
            return '[Unserializable Object]';
        }
    }
    return String(arg);
}

/**
 * 核心日志记录函数
 * @param {string} level - 日志级别
 * @param  {...any} args - 日志内容
 */
function log(level, ...args) {
    if (levels[level] > currentLevel) {
        return;
    }
    const now = new Date();
    const timestamp = now.toISOString();
    const color = colors[level] || colors.info;
    
    // 输出到控制台 (带颜色)
    console.log(`${color}[${timestamp}] [${level.toUpperCase()}]${colors.reset}`, ...args);

    // 写入文件 (不带颜色)
    const fileMessage = `[${timestamp}] [${level.toUpperCase()}] ${args.map(formatArg).join(' ')}\n`;
    
    // 使用 setImmediate 避免阻塞主线程
    setImmediate(() => {
        if (logStream.writable) {
            logStream.write(fileMessage);
        }
    });
}

export default {
    trace: (...args) => log('trace', ...args),
    debug: (...args) => log('debug', ...args),
    info: (...args) => log('info', ...args),
    warn: (...args) => log('warn', ...args),
    error: (...args) => log('error', ...args),
    fatal: (...args) => log('fatal', ...args),
};