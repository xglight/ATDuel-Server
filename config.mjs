/**
 * @file 集中管理服务器配置的模块
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '.env') });

/**
 * 从环境变量获取配置，带默认值
 * @param {string} key 环境变量名
 * @param {any} defaultValue 默认值
 * @returns {any}
 */
function getEnv(key, defaultValue) {
    const value = process.env[key];
    if (value === undefined) {
        return defaultValue;
    }
    // 尝试转换数字
    if (!isNaN(value) && value !== '') {
        return Number(value);
    }
    return value;
}

/**
 * 服务器配置
 */
const SERVER_CONFIG = {
    protocol: getEnv('SERVER_PROTOCOL', 'http'),
    host: getEnv('SERVER_HOST', 'localhost'),
    port: getEnv('SERVER_PORT', 3000),
    apiPrefix: getEnv('SERVER_API_PREFIX', '/api')
};

/**
 * 构建 API URL
 * @param {string} endpoint 端点路径
 * @returns {string} 完整的 API URL
 */
function buildApiUrl(endpoint) {
    return `${SERVER_CONFIG.protocol}://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}${SERVER_CONFIG.apiPrefix}${endpoint}`
}

/**
 * MySQL 数据库配置
 */
const MYSQL_CONFIG = {
    host: getEnv('MYSQL_HOST', 'localhost'),
    port: getEnv('MYSQL_PORT', 3306),
    user: getEnv('MYSQL_USER', 'root'),
    password: getEnv('MYSQL_PASSWORD', ''),
    database: getEnv('MYSQL_DATABASE', 'atduel')
};

/**
 * 注册相关配置
 */
const REGISTER_CONFIG = {
    ratingLowerLimit: getEnv('REGISTER_RATING_LOWER_LIMIT', 1000)
};

/**
 * 内容相关配置
 */
const CONTENT_CONFIG = {
    peopleLimit: getEnv('CONTENT_PEOPLE_LIMIT', 3),
    problemCountLowerLimit: getEnv('CONTENT_PROBLEM_COUNT_LOWER_LIMIT', 1),
    problemCountUpperLimit: getEnv('CONTENT_PROBLEM_COUNT_UPPER_LIMIT', 10),
    problemDifficultyLowerLimit: getEnv('CONTENT_PROBLEM_DIFFICULTY_LOWER_LIMIT', -1500),
    problemDifficultyUpperLimit: getEnv('CONTENT_PROBLEM_DIFFICULTY_UPPER_LIMIT', 4400),
    timeLimit: getEnv('CONTENT_TIME_LIMIT', 86400),
    categories: getEnv('CONTENT_CATEGORIES', 'ABC,ARC,AGC,Other'),
    maxMessageLength: getEnv('CONTENT_MAX_MESSAGE_LENGTH', 200),
    chatRateLimit: getEnv('CONTENT_CHAT_RATE_LIMIT', 3000)
};

/**
 * 日志等级
 */
const LOG_LEVEL = getEnv('LOG_LEVEL', 'info');

/**
 * Eden AI 配置
 */
const EDEN_AI_CONFIG = {
    apiKey: getEnv('EDEN_AI_API_KEY', '')
};

export default {
    server: SERVER_CONFIG,
    mysql: MYSQL_CONFIG,
    register: REGISTER_CONFIG,
    content: CONTENT_CONFIG,
    edenAI: EDEN_AI_CONFIG,
    logLevel: LOG_LEVEL,
    buildApiUrl
};