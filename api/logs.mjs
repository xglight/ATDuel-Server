import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../logger.mjs';
import pool from '../db.mjs';
import { verifyAdmin } from '../utils/auth.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logDir = path.join(__dirname, '..', 'logs');

/**
 * 获取最新的日志文件路径
 *
 * @returns {string|null} 日志文件路径或 null
 */
const getLatestLogFile = () => {
    try {
        if (!fs.existsSync(logDir)) return null;
        const files = fs.readdirSync(logDir);
        const logFiles = files.filter(file => file.startsWith('server-') && file.endsWith('.log'));

        if (logFiles.length === 0) {
            const oldLog = path.join(logDir, 'server.log');
            return fs.existsSync(oldLog) ? oldLog : null;
        }

        logFiles.sort((a, b) => {
            return fs.statSync(path.join(logDir, b)).mtime.getTime() -
                fs.statSync(path.join(logDir, a)).mtime.getTime();
        });
        return path.join(logDir, logFiles[0]);
    } catch (error) {
        logger.error('查找最新日志文件时出错:', error);
        return null;
    }
};

/**
 * 获取系统日志接口处理函数
 *
 * @param {import('koa').Context} ctx - Koa 上下文
 */
async function getLogs(ctx) {
    const { token, date } = ctx.request.body;

    if (!token) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'Token 不能为空' };
        return;
    }

    if (!(await verifyAdmin(token))) {
        ctx.status = 401;
        ctx.body = { success: false, message: '管理员权限校验失败' };
        return;
    }

    logger.debug(`getLogs: 正在请求日志，日期: ${date || '最新'}`);
    try {
        if (date) {
            logger.debug(`getLogs: 正在搜索日期为 ${date} 的日志`);
            if (!fs.existsSync(logDir)) {
                ctx.status = 404;
                ctx.body = { success: false, message: '未找到日志目录' };
                return;
            }
            const files = fs.readdirSync(logDir);
            const matchingFiles = files.filter(file => file.startsWith(`server-${date}`) && file.endsWith('.log'));

            if (matchingFiles.length === 0) {
                ctx.status = 404;
                ctx.body = { success: false, message: `未找到日期为 ${date} 的日志` };
                return;
            }

            const mergedContent = matchingFiles.map(file => {
                const filePath = path.join(logDir, file);
                return fs.readFileSync(filePath, 'utf8');
            }).join('\n');

            ctx.status = 200;
            ctx.body = { success: true, data: mergedContent };
        } else {
            logger.debug('getLogs: 未提供日期，正在获取最新日志文件');
            const latestLogFile = getLatestLogFile();
            if (!latestLogFile) {
                ctx.status = 404;
                ctx.body = { success: false, message: '未找到日志文件' };
                return;
            }
            const content = fs.readFileSync(latestLogFile, 'utf8');
            ctx.status = 200;
            ctx.body = { success: true, data: content };
        }
    } catch (err) {
        logger.error(`getLogs: 处理日志请求时发生错误: ${err.message}`);
        ctx.status = 500;
        ctx.body = { success: false, message: '服务器内部错误' };
    }
}

export default {
    'POST /admin/logs': getLogs,
};
