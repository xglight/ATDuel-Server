import pool from './db.mjs';
import Koa from 'koa';
import bodyParser from '@koa/bodyparser';
import cors from '@koa/cors';
import apiControl from './import_api.mjs';
import logger from './logger.mjs';
import { WebSocketServer } from 'ws';

const app = new Koa();
const port = 3000;

// 创建WebSocket服务器
const wss = new WebSocketServer({ noServer: true });
const roomClients = new Map(); // roomId -> Set of clients
const contestClients = new Map(); // contestId -> Set of clients

// 存储消息到数据库
async function storeMessage(type, contestId, teamId, sender, message, mode) {
    await pool.query(
        'INSERT INTO contest_messages (type, contest_id, team_id, sender, message, mode) VALUES (?,?,?,?,?,?)',
        [type, contestId, teamId, sender, message, mode]
    );
}

// 获取房间历史消息
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
            contestId: row.contest_id,
            teamId: row.team_id,
            sender: row.sender,
            message: row.message,
            mode: row.mode,
            timestamp: row.timestamp
        };
    });
}

// 广播消息给特定房间的客户端
function broadcastToRoom(roomId, message) {
    const clients = roomClients.get(roomId);
    if (clients) {
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }
}

function broadcastToContest(contestId, message) {
    const clients = contestClients.get(contestId);
    if (clients) {
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }
}

async function main() {
    // 中间件顺序很重要
    app.use(bodyParser());
    app.use(cors({
        origin: '*',
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['*'],
    }));

    // 路由和错误处理（添加API前缀）
    const router = await apiControl(app, 'api', '/api');

    // 使用路由中间件
    app.use(router);

    // 错误处理
    app.on('error', (err, ctx) => {
        logger.fatal('Server error:', err);
    });

    const server = app.listen(port, () => {
        logger.info(`server: 服务器运行在 http://localhost:${port}`);
    }).on('error', err => {
        logger.fatal('server: 服务器启动出错: ', err.stack);
        process.exit(1);
    });

    // 监听广播事件
    app.on('broadcast', (message) => {
        if (message.roomId) {
            broadcastToRoom(message.roomId, message);
        }
        else if (message.contestId && message.type === 'contest_update') {
            broadcastToContest(message.contestId, message);
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
                    logger.debug(`ws: 客户端 ${ws._socket.remoteAddress} 加入房间 ${roomId}`);
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
                    logger.debug(`ws: 客户端 ${ws._socket.remoteAddress} 加入比赛 ${contestId}`);
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
                                if (msg.type == "system_message") {
                                    ws.send(JSON.stringify({
                                        type: 'system_message',
                                        message: msg.message,
                                        timestamp: msg.timestamp
                                    }));
                                } else {
                                    ws.send(JSON.stringify({
                                        type: 'chat_message',
                                        sender: msg.sender,
                                        message: msg.message,
                                        mode: msg.mode,
                                        teamId: msg.teamId || null,
                                        timestamp: msg.timestamp
                                    }));
                                }
                            });
                        }
                    } catch (error) {
                        logger.error('ws: 获取历史消息失败: ', error);
                    }
                } else if (data.type === 'chat_message') {
                    // 输入验证
                    if (!data.contestId || !data.sender || !data.message || !data.mode) {
                        logger.warn('ws: 无效的聊天消息: ', data);
                        return;
                    }
                    logger.debug(`ws: 收到聊天消息: ${data.message} 用户: ${data.sender} 模式: ${data.mode}`);
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
                        logger.error('ws: 存储消息失败: ', error);
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
                            clients.forEach(client => {
                                if (client.teamId === ws.teamId && client.readyState === WebSocket.OPEN) {
                                    client.send(JSON.stringify({
                                        type: 'chat_message',
                                        sender: data.sender,
                                        message: data.message,
                                        mode: 'team',
                                        teamId: ws.teamId,
                                        timestamp: new Date().toISOString()
                                    }));
                                }
                            });
                        }
                    }
                } else if (data.type == 'system_message') {

                }
            } catch (error) {
                logger.error('ws: WebSocket 消息出错: ', error);
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
        logger.info('server: 服务器正在关闭...');
        try {
            server.close(() => logger.info('server: Koa 服务器已关闭'));
            if (pool) {
                await pool.end();
                logger.info('server: 数据库连接池已关闭');
            }
        } catch (err) {
            logger.fatal('server: 关闭资源时出错: ', err.stack);
        } finally {
            logger.info('server: 服务器已关闭');
            process.exit(0);
        }
    });
}

// 启动主进程
main();
