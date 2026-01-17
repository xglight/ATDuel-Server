import pool from './db.mjs';
import Koa from 'koa';
import bodyParser from '@koa/bodyparser';
import cors from '@koa/cors';
import serve from 'koa-static';
import mount from 'koa-mount';
import path from 'path';
import { fileURLToPath } from 'url';
import apiControl from './import_api.mjs';
import logger from './logger.mjs';
import config from './config.mjs';
import { WebSocketServer, WebSocket } from 'ws';
import clientRoutes from '../ATDuel-Client/source/load.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = new Koa();
const port = config.server.port;

// 创建WebSocket服务器
const wss = new WebSocketServer({ noServer: true });
const roomClients = new Map(); // roomId -> Set of clients
const contestClients = new Map(); // contestId -> Set of clients

/**
 * 存储消息到数据库
 * @param {string} type 消息类型
 * @param {string} contestId 比赛ID
 * @param {string} teamId 队伍ID
 * @param {string} sender 发送者
 * @param {string} message 消息内容
 * @param {string} mode 发送模式 (all/team)
 */
async function storeMessage(type, contestId, teamId, sender, message, mode) {
    await pool.query(
        'INSERT INTO contest_messages (type, contest_id, team_id, sender, message, mode) VALUES (?,?,?,?,?,?)',
        [type, contestId, teamId, sender, message, mode]
    );
}

/**
 * 获取房间历史消息
 * @param {string} contestId 比赛ID
 * @returns {Promise<Array|null>} 历史消息列表
 */
async function getContestMessage(contestId) {
    let result;
    [result] = await pool.query(
        `SELECT * FROM contest_messages WHERE contest_id = ? AND (type = "chat_message" OR type = "system_message") ORDER BY timestamp ASC`,
        [contestId]
    );
    if (result.length == 0) {
        return null;
    }
    return result.map(row => {
        return {
            type: row.type,
            contestId: row.contest_id,
            teamId: row.team_id,
            sender: row.sender,
            message: row.message,
            mode: row.mode,
            timestamp: row.timestamp
        };
    });
}

/**
 * 广播消息给特定房间的所有客户端
 * @param {string} roomId 房间ID
 * @param {object} message 要广播的消息对象
 */
function broadcastToRoom(roomId, message) {
    const clients = roomClients.get(roomId);
    if (clients) {
        const data = JSON.stringify(message);
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(data, (err) => {
                        if (err) {
                            logger.error(`ws: Room ${roomId} broadcast failed:`, err);
                        }
                    });
                } catch (err) {
                    logger.error(`ws: Room ${roomId} broadcast exception:`, err);
                }
            }
        });
    }
}

/**
 * 广播消息给特定比赛的所有客户端
 * @param {string} contestId 比赛ID
 * @param {object} message 要广播的消息对象
 */
function broadcastToContest(contestId, message) {
    const clients = contestClients.get(contestId);
    if (clients) {
        const data = JSON.stringify(message);
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(data, (err) => {
                        if (err) {
                            logger.error(`ws: Contest ${contestId} broadcast failed:`, err);
                        }
                    });
                } catch (err) {
                    logger.error(`ws: Contest ${contestId} broadcast exception:`, err);
                }
            }
        });
    }
}

/**
 * 主函数，启动服务器
 */
async function main() {
    // 中间件顺序很重要
    app.use(bodyParser());
    app.use(cors({
        origin: '*',
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['*'],
    }));

    // API 路由 (后端)
    const apiRouter = await apiControl(app, 'api', '/api');
    app.use(apiRouter);

    // 错误处理
    app.on('error', (err, ctx) => {
        logger.fatal('Server error:', err);
    });

    const server = app.listen(port, () => {
        logger.info(`server: Server running at http://localhost:${port}`);
    }).on('error', err => {
        logger.fatal('server: Server startup error: ', err.stack);
        process.exit(1);
    });

    // 监听广播事件
    app.on('broadcast', (message) => {
        if (message.roomId) {
            broadcastToRoom(message.roomId, message);
        }
        else if (message.contestId) {
            if (message.type === 'contest_update' || message.type === 'system_message') {
                broadcastToContest(message.contestId, message);
            }
        }
    });

    // 处理WebSocket升级请求
    server.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, ws => {
            wss.emit('connection', ws, request);
        });
    });

    // WebSocket连接处理
    wss.on('connection', async (ws) => {

        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'join_room' && data.roomId) {
                    const roomId = data.roomId;
                    if (!roomClients.has(roomId)) {
                        roomClients.set(roomId, new Set());
                    }
                    roomClients.get(roomId).add(ws);
                    logger.debug(`ws: Client ${ws._socket.remoteAddress} joined room ${roomId}`);
                    ws.roomId = roomId;
                }
                else if (data.type === 'join_contest' && data.contestId) {
                    // 加入比赛
                    const contestId = data.contestId;
                    if (!contestClients.has(contestId)) {
                        contestClients.set(contestId, new Set());
                    }
                    contestClients.get(contestId).add(ws);
                    ws.contestId = contestId;
                    logger.debug(`ws: Client ${ws._socket.remoteAddress} joined contest ${contestId}`);
                    ws.teamId = data.teamId; // 保存队伍ID

                    // 发送历史消息
                    try {
                        // 获取历史消息时严格按队伍隔离
                        const history = await getContestMessage(contestId) || [];
                        const filteredHistory = history.filter(msg =>
                            msg.mode == 'all' || msg.teamId === data.teamId || msg.type == "system_message"
                        );

                        if (Array.isArray(filteredHistory)) {
                            filteredHistory.forEach(msg => {
                                try {
                                    if (msg.type == "system_message") {
                                        ws.send(JSON.stringify({
                                            type: 'system_message',
                                            message: msg.message,
                                            timestamp: msg.timestamp
                                        }), (err) => {
                                            if (err) logger.error('ws: Failed to send historical system messages:', err);
                                        });
                                    } else {
                                        ws.send(JSON.stringify({
                                            type: 'chat_message',
                                            sender: msg.sender,
                                            message: msg.message,
                                            mode: msg.mode,
                                            teamId: msg.teamId || null,
                                            timestamp: msg.timestamp
                                        }), (err) => {
                                            if (err) logger.error('ws: Failed to send historical chat messages:', err);
                                        });
                                    }
                                } catch (err) {
                                    logger.error('ws: Exception while sending historical messages:', err);
                                }
                            });
                        }
                    } catch (error) {
                        logger.error('ws: Failed to fetch historical messages: ', error);
                    }
                } else if (data.type === 'chat_message') {
                    // 输入验证
                    if (!data.contestId || !data.sender || !data.message || !data.mode) {
                        logger.warn('ws: Invalid chat message: ', data);
                        return;
                    }
                    logger.debug(`ws: Received chat message: ${data.message} User: ${data.sender} Mode: ${data.mode}`);
                    try {
                        // 存储消息
                        await storeMessage(
                            data.type,
                            data.contestId,
                            data.mode === 'team' ? ws.teamId : null,
                            data.sender,
                            data.message,
                            data.mode
                        );
                    } catch (error) {
                        logger.error('ws: Failed to store message: ', error);
                    }

                    if (data.mode === 'all') {
                        // 全局消息发送给比赛所有人
                        broadcastToContest(data.contestId, {
                            type: 'chat_message',
                            sender: data.sender,
                            message: data.message,
                            mode: 'all',
                            timestamp: new Date().toISOString()
                        });
                    } else if (data.mode === 'team') {
                        // 队伍消息只发送给同队伍成员
                        const clients = contestClients.get(data.contestId);
                        if (clients) {
                            const teamData = JSON.stringify({
                                type: 'chat_message',
                                sender: data.sender,
                                message: data.message,
                                mode: 'team',
                                teamId: ws.teamId,
                                timestamp: new Date().toISOString()
                            });
                            clients.forEach(client => {
                                if (client.teamId === ws.teamId && client.readyState === WebSocket.OPEN) {
                                    try {
                                        client.send(teamData, (err) => {
                                            if (err) {
                                                logger.error(`ws: Team ${ws.teamId} message delivery failed:`, err);
                                            }
                                        });
                                    } catch (err) {
                                        logger.error(`ws: Team ${ws.teamId} message delivery exception:`, err);
                                    }
                                }
                            });
                        }
                    }
                } else if (data.type === 'system_message') {
                    // 系统消息处理
                    if (!data.contestId || !data.message) {
                        logger.warn('ws: Invalid system message: ', data);
                        return;
                    }
                    logger.debug(`ws: Received system message: ${data.message} Contest: ${data.contestId}`);
                    try {
                        // 存储系统消息
                        await storeMessage(
                            'system_message',
                            data.contestId,
                            null,
                            'SYSTEM',
                            data.message,
                            'all'
                        );

                        // 广播给所有人
                        broadcastToContest(data.contestId, {
                            type: 'system_message',
                            message: data.message,
                            timestamp: new Date().toISOString()
                        });
                    } catch (error) {
                        logger.error('ws: Failed to process system message: ', error);
                    }
                }
            } catch (error) {
                logger.error('ws: WebSocket message error: ', error);
            }
        });

        ws.on('close', () => {
            if (ws.roomId) {
                const clients = roomClients.get(ws.roomId);
                if (clients) {
                    clients.delete(ws);
                    if (clients.size === 0) {
                        roomClients.delete(ws.roomId);
                    }
                }
            }
            if (ws.contestId) {
                const clients = contestClients.get(ws.contestId);
                if (clients) {
                    clients.delete(ws);
                    if (clients.size === 0) {
                        contestClients.delete(ws.contestId);
                    }
                }
            }
        });
    });

    // 监听进程关闭信号
    process.on('SIGINT', async () => {
        logger.info('server: Server is shutting down...');
        try {
            server.close(() => logger.info('server: Koa server closed'));
            if (pool) {
                await pool.end();
                logger.info('server: Database connection pool closed');
            }
        } catch (err) {
            logger.fatal('server: Error while closing resources: ', err.stack);
        } finally {
            logger.info('server: Server closed');
            process.exit(0);
        }
    });
}

// 启动主进程
main();
