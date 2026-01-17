import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../logger.mjs';
import config from '../config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logDir = path.join(__dirname, '..', 'logs');

const getLatestLogFile = () => {
    try {
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
        logger.error('Error finding latest log file:', error);
        return null;
    }
};

async function getLogs(ctx, next) {
    const { token, date } = ctx.request.body;

    if (!token) {
        ctx.status = 400;
        ctx.body = { success: false, message: 'token can not be empty' };
        return;
    }
    logger.debug(`getLogs: Requesting logs, date: ${date}`);
    try {
        const response = await fetch(config.buildApiUrl('/admin/check'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token }),
        });
        const adminCheck = await response.json();

        if (adminCheck.success === false) {
            ctx.status = 400;
            ctx.body = { success: false, message: 'Token is invalid.' };
            return;
        }

        if (date) {
            logger.debug(`getLogs: Searching for logs for date ${date}`);
            const files = fs.readdirSync(logDir);
            const matchingFiles = files.filter(file => file.startsWith(`server-${date}`) && file.endsWith('.log'));

            if (matchingFiles.length === 0) {
                ctx.body = `No logs found for date: ${date}`;
                return;
            }

            const mergedContent = matchingFiles.map(file => {
                const filePath = path.join(logDir, file);
                return fs.readFileSync(filePath, 'utf8');
            }).join('\n');

            ctx.body = mergedContent;
        } else {
            logger.debug(`getLogs: No date provided, fetching latest log file.`);
            const latestLogFile = getLatestLogFile();
            if (!latestLogFile) {
                ctx.status = 404;
                ctx.body = { message: 'No log file found' };
                return;
            }
            ctx.body = fs.readFileSync(latestLogFile, 'utf8');
        }
    } catch (err) {
        logger.error('Failed to process /admin/logs request:', err);
        ctx.status = 500;
        ctx.body = { message: 'Failed to process log request' };
    }
}

export default {
    'POST /admin/logs': getLogs,
};
