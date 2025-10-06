import config from './config.mjs';

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
    trace: '\x1b[90m', // grey
    debug: '\x1b[34m', // blue
    info: '\x1b[32m',  // green
    warn: '\x1b[33m',  // yellow
    error: '\x1b[31m', // red
    fatal: '\x1b[35m', // magenta
    reset: '\x1b[0m'
};

function log(level, ...args) {
    if (levels[level] > currentLevel) {
        return;
    }
    const timestamp = new Date().toISOString();
    const color = colors[level] || colors.info;
    console.log(`${color}[${timestamp}] [${level.toUpperCase()}]${colors.reset}`, ...args);
}

export default {
    trace: (...args) => log('trace', ...args),
    debug: (...args) => log('debug', ...args),
    info: (...args) => log('info', ...args),
    warn: (...args) => log('warn', ...args),
    error: (...args) => log('error', ...args),
    fatal: (...args) => log('fatal', ...args),
};