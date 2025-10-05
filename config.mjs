/**
 * @file 集中管理服务器配置的模块
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configData = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));

/**
 * 服务器配置
 * @type {object}
 * @property {string} protocol - 服务器协议
 * @property {string} host - 服务器主机名
 * @property {number} port - 服务器端口
 * @property {string} apiPrefix - API前缀
 */
const SERVER_CONFIG = configData.server;

function buildApiUrl(endpoint) {
    return `${SERVER_CONFIG.protocol}://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}${SERVER_CONFIG.apiPrefix}${endpoint}`
}

/**
 * MySQL数据库配置
 * @type {object}
 * @property {string} host - 数据库主机名
 * @property {number} port - 数据库端口
 * @property {string} user - 数据库用户名
 * @property {string} password - 数据库密码
 * @property {string} database - 数据库名
 */
const MYSQL_CONFIG = configData.mysql;

/**
 * 注册相关配置
 * @type {object}
 * @property {number} ratingLowerLimit - 注册用户的最低Rating
 */
const REGISTER_CONFIG = configData.register;

/**
 * 内容相关配置
 * @type {object}
 * @property {number} peopleLimit - 房间人数限制
 * @property {number} problemCountLowerLimit - 题目数量下限
 * @property {number} problemCountUpperLimit - 题目数量上限
 * @property {number} timeLimit - 时间限制
 */
const CONTENT_CONFIG = configData.content;

export default {
    server: SERVER_CONFIG,
    mysql: MYSQL_CONFIG,
    register: REGISTER_CONFIG,
    content: CONTENT_CONFIG,
    buildApiUrl
};