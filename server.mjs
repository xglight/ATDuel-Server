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
import requestStore from './tools/change_request_store.mjs';
import { finalizeContest } from './api/contest_final.mjs';
import actionStore from './tools/contest_action_store.mjs';
import { verifyUser } from './utils/auth.mjs';
import { moderateText } from './utils/moderation.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = new Koa();
const port = config.server.port;

// 创建WebSocket服务器
const wss = new WebSocketServer({ noServer: true });
const roomClients = new Map(); // roomId -> Set of clients
const contestClients = new Map(); // contestId -> Set of clients
const globalClients = new Set(); // Global chat clients
const lastMessageTime = new Map(); // username -> timestamp

/**
 * 解析 Cookie 字符串
 * @param {string} cookieStr Cookie 字符串
 * @returns {object} 解析后的 Cookie 对象
 */
function parseCookies(cookieStr) {
    const cookies = {};
    if (!cookieStr) return cookies;
    cookieStr.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        if (parts.length === 2) {
            cookies[parts[0].trim()] = parts[1].trim();
        }
    });
    return cookies;
}

/**
 * 转义 HTML 字符以防止 XSS 攻击
 * @param {string} str 需要转义的字符串
 * @returns {string} 转义后的字符串
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * 检查用户是否发送消息过快
 * @param {string} username 用户名
 * @returns {boolean} 是否允许发送
 */
function checkRateLimit(username) {
    const now = Date.now();
    const lastTime = lastMessageTime.get(username) || 0;
    const interval = config.content.chatRateLimit; // 使用配置中的限制

    if (now - lastTime < interval) {
        return false;
    }
    lastMessageTime.set(username, now);
    return true;
}

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
 * 存储房间消息到数据库
 * @param {string} roomUrl 房间URL
 * @param {string} sender 发送者
 * @param {string} message 消息内容
 */
async function storeRoomMessage(roomUrl, sender, message) {
    await pool.query(
        'INSERT INTO room_messages (room_url, sender, message) VALUES (?,?,?)',
        [roomUrl, sender, message]
    );
}

/**
 * 存储全局消息到数据库
 * @param {string} sender 发送者
 * @param {string} message 消息内容
 */
async function storeGlobalMessage(sender, message) {
    await pool.query(
        'INSERT INTO global_messages (sender, message) VALUES (?,?)',
        [sender, message]
    );
}

/**
 * 获取全局历史消息
 * @returns {Promise<Array>} 历史消息列表
 */
async function getGlobalMessages() {
    const [rows] = await pool.query(
        'SELECT sender, message, timestamp FROM global_messages ORDER BY timestamp ASC LIMIT 100'
    );
    return rows;
}

/**
 * 获取房间历史消息
 * @param {string} roomUrl 房间URL
 * @returns {Promise<Array>} 历史消息列表
 */
async function getRoomMessages(roomUrl) {
    const [rows] = await pool.query(
        'SELECT sender, message, timestamp FROM room_messages WHERE room_url = ? ORDER BY timestamp ASC LIMIT 100',
        [roomUrl]
    );
    return rows;
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
 * @param {string} targetTeam 目标队伍ID (可选，用于认输请求等)
 */
function broadcastToContest(contestId, message, targetTeam = null) {
    const clients = contestClients.get(contestId);
    if (clients) {
        const data = JSON.stringify(message);
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                // 如果指定了目标队伍，则只发送给该队伍的成员
                if (targetTeam && client.teamId !== targetTeam) {
                    return;
                }
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
 * 广播消息给所有连接到主页的客户端
 * @param {object} message 要广播的消息对象
 */
function broadcastToGlobal(message) {
    const data = JSON.stringify(message);
    globalClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(data, (err) => {
                    if (err) {
                        logger.error('ws: Global broadcast failed:', err);
                    }
                });
            } catch (err) {
                logger.error('ws: Global broadcast exception:', err);
            }
        }
    });
}

/**
 * 主函数，启动服务器
 */
async function main() {
    // 中间件顺序很重要
    app.use(bodyParser());
    app.use(cors({
        origin: (ctx) => {
            // 允许来自特定域的请求，或者在开发环境下允许所有
            const origin = ctx.get('Origin');
            return origin || '*';
        },
        credentials: true,
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
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
    app.on('broadcast', async (message) => {
        if (message.roomId) {
            broadcastToRoom(message.roomId, message);
        }
        else if (message.contestId) {
            // 1. 广播原始消息 (用于触发实时 UI，如投票卡片)
            if (['contest_update', 'system_message', 'change_problem_request', 'change_problem_result', 'contest_action_request', 'contest_action_update', 'contest_action_result'].includes(message.type)) {
                broadcastToContest(message.contestId, message, message.targetTeam);
            }

            // 2. 转换特定业务消息为永久系统消息并持久化
            try {
                let systemMsgText = null;

                if (message.type === 'change_problem_request') {
                    systemMsgText = `队伍 ${escapeHtml(message.data.requesterTeam)} 发起了换题请求：${escapeHtml(message.data.problemTitle)}`;
                } else if (message.type === 'change_problem_result') {
                    systemMsgText = escapeHtml(message.data.message);
                } else if (message.type === 'contest_action_request') {
                    const actionName = message.data.type === 'draw' ? '平局' : '认输';
                    systemMsgText = message.data.type === 'draw' ? `有人发起了${actionName}请求` : `队伍 ${escapeHtml(message.data.requesterTeam)} 发起了${actionName}请求`;
                } else if (message.type === 'contest_action_result') {
                    // 处理成功和失败的情况
                    systemMsgText = escapeHtml(message.data.message);
                    // 这里不再追加 Rating 信息，让其由 contest_update 独立生成
                } else if (message.type === 'contest_update' && message.status === 2) {
                    // 无论是否开启 rated，只要比赛状态变为 2 (已结束)，始终生成结束消息
                    let systemMsgContent = (message.data && message.data.message) ? `${escapeHtml(message.data.message)}\nRating 变动如下：` : '比赛已结束！\nRating 变动如下：';
                    if (message.ratingChanges && Object.keys(message.ratingChanges).length > 0) {
                        for (const [username, change] of Object.entries(message.ratingChanges)) {
                            const deltaStr = change.delta >= 0 ? `+${change.delta}` : `${change.delta}`;
                            systemMsgContent += `\n${escapeHtml(username)}: ${change.oldRating} -> ${change.newRating} (${deltaStr})`;
                        }
                    } else {
                        systemMsgContent += '\nRating 将不会被计算。';
                    }
                    systemMsgText = systemMsgContent;
                } else if (message.type === 'system_message' && message.message) {
                    // 已经是 system_message 类型，只需确保持久化 (避免重复广播)
                    await storeMessage('system_message', message.contestId, null, 'SYSTEM', escapeHtml(message.message), 'all');
                    return;
                }

                if (systemMsgText) {
                    logger.debug(`server: Storing and broadcasting persistent system message for ${message.type}: ${systemMsgText}`);
                    // 持久化到数据库
                    await storeMessage('system_message', message.contestId, null, 'SYSTEM', systemMsgText, 'all');

                    // 广播一条同步的系统消息，确保实时显示在聊天区
                    broadcastToContest(message.contestId, {
                        type: 'system_message',
                        message: systemMsgText,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (err) {
                logger.error('server: Failed to process persistent system message:', err);
            }
        }
    });

    // WebSocket升级请求处理
    server.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, ws => {
            wss.emit('connection', ws, request);
        });
    });

    // WebSocket连接处理
    wss.on('connection', async (ws, request) => {
        ws.isAlive = true;

        // 从 Cookie 中获取用户信息
        const cookies = parseCookies(request.headers.cookie);
        const username = cookies.username;
        const token = cookies.token;

        if (username && token) {
            const authResult = await verifyUser({ username, token });
            if (authResult.success) {
                ws.username = authResult.username;
                logger.debug(`ws: User ${ws.username} connected via WebSocket`);
            }
        }

        ws.on('pong', () => {
            ws.isAlive = true;
        });

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

                    // 发送历史消息
                    try {
                        const history = await getRoomMessages(roomId);
                        if (history && history.length > 0) {
                            ws.send(JSON.stringify({
                                type: 'room_history',
                                roomId: roomId,
                                history: history
                            }));
                        }
                    } catch (error) {
                        logger.error('ws: Failed to fetch room history: ', error);
                    }
                }
                else if (data.type === 'join_global') {
                    globalClients.add(ws);
                    ws.isGlobal = true;
                    logger.debug(`ws: Client ${ws._socket.remoteAddress} joined global chat`);

                    // 发送历史消息
                    try {
                        const history = await getGlobalMessages();
                        if (history && history.length > 0) {
                            ws.send(JSON.stringify({
                                type: 'global_history',
                                history: history
                            }));
                        }
                    } catch (error) {
                        logger.error('ws: Failed to fetch global history: ', error);
                    }
                }
                else if (data.type === 'global_chat') {
                    if (!ws.username || !data.message) {
                        logger.warn('ws: Invalid global chat message or unauthenticated user: ', data);
                        return;
                    }
                    // 转义 HTML
                    data.message = escapeHtml(data.message);

                    if (data.message.length > config.content.maxMessageLength) {
                        logger.warn(`ws: Global chat message too long (${data.message.length}) from ${ws.username}`);
                        return;
                    }
                    // 速率限制检查
                    if (!checkRateLimit(ws.username)) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: '消息发送频率过快，请稍后再试'
                        }));
                        return;
                    }

                    // AI 内容审查
                    const moderation = await moderateText(data.message);
                    if (!moderation.isSafe) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: `消息未通过审查: ${moderation.reason}`
                        }));
                        return;
                    }

                    try {
                        await storeGlobalMessage(ws.username, data.message);
                        broadcastToGlobal({
                            type: 'global_chat',
                            sender: ws.username,
                            message: data.message,
                            timestamp: new Date().toISOString()
                        });
                    } catch (error) {
                        logger.error('ws: Failed to process global chat: ', error);
                    }
                }
                else if (data.type === 'room_chat') {
                    // 房间聊天处理
                    if (!data.roomId || !ws.username || !data.message) {
                        logger.warn('ws: Invalid room chat message or unauthenticated user: ', data);
                        return;
                    }
                    // 转义 HTML
                    data.message = escapeHtml(data.message);

                    // 消息长度校验
                    if (data.message.length > config.content.maxMessageLength) {
                        logger.warn(`ws: Room chat message too long (${data.message.length}) from ${ws.username}`);
                        return;
                    }
                    // 速率限制检查
                    if (!checkRateLimit(ws.username)) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: '消息发送频率过快，请稍后再试'
                        }));
                        return;
                    }

                    // AI 内容审查
                    const moderation = await moderateText(data.message);
                    if (!moderation.isSafe) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: `消息未通过审查: ${moderation.reason}`
                        }));
                        return;
                    }

                    logger.debug(`ws: Received room chat: ${data.message} User: ${ws.username} Room: ${data.roomId}`);
                    try {
                        // 存储消息
                        await storeRoomMessage(data.roomId, ws.username, data.message);

                        // 广播给房间所有人
                        broadcastToRoom(data.roomId, {
                            type: 'room_chat',
                            roomId: data.roomId,
                            sender: ws.username,
                            message: data.message,
                            timestamp: new Date().toISOString()
                        });
                    } catch (error) {
                        logger.error('ws: Failed to process room chat: ', error);
                    }
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

                    // 发送当前正在进行的换题请求
                    const activeReq = requestStore.get(contestId);
                    if (activeReq) {
                        try {
                            // 构造安全的数据对象（去除 timer 等内部属性）
                            const safeReqData = {
                                requestId: activeReq.requestId,
                                problemId: activeReq.problemId,
                                problemTitle: activeReq.problemTitle,
                                requesterTeam: activeReq.requesterTeam,
                                requesterName: activeReq.requesterName,
                                expireAt: activeReq.expireAt
                            };
                            ws.send(JSON.stringify({
                                type: 'change_problem_request',
                                data: safeReqData
                            }));
                        } catch (err) {
                            logger.error('ws: Failed to send active change request:', err);
                        }
                    }

                    // 发送当前正在进行的比赛动作请求（平局/认输）
                    const activeAction = actionStore.get(contestId);
                    if (activeAction) {
                        try {
                            // 认输请求仅对本队成员可见
                            if (activeAction.type === 'surrender' && activeAction.requesterTeam !== ws.teamId) {
                                // 不发送
                            } else {
                                // 构造安全的数据对象（去除 timer, Set 等内部/循环引用属性）
                                const safeActionData = {
                                    type: activeAction.type,
                                    requestId: activeAction.requestId,
                                    requesterTeam: activeAction.requesterTeam,
                                    requesterName: activeAction.requesterName,
                                    totalNeeded: activeAction.totalNeeded,
                                    expireAt: activeAction.expireAt,
                                    currentVotes: activeAction.votes.size
                                };
                                ws.send(JSON.stringify({
                                    type: 'contest_action_request',
                                    data: safeActionData
                                }));
                            }
                        } catch (err) {
                            logger.error('ws: Failed to send active contest action:', err);
                        }
                    }

                } else if (data.type === 'chat_message') {
                    // 输入验证
                    if (!data.contestId || !ws.username || !data.message || !data.mode) {
                        logger.warn('ws: Invalid chat message or unauthenticated user: ', data);
                        return;
                    }
                    // 转义 HTML
                    data.message = escapeHtml(data.message);

                    // 消息长度校验
                    if (data.message.length > config.content.maxMessageLength) {
                        logger.warn(`ws: Contest chat message too long (${data.message.length}) from ${ws.username}`);
                        return;
                    }
                    // 速率限制检查
                    if (!checkRateLimit(ws.username)) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: '消息发送频率过快，请稍后再试'
                        }));
                        return;
                    }

                    // AI 内容审查
                    const moderation = await moderateText(data.message);
                    if (!moderation.isSafe) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: `消息未通过审查: ${moderation.reason}`
                        }));
                        return;
                    }

                    logger.debug(`ws: Received chat message: ${data.message} User: ${ws.username} Mode: ${data.mode}`);
                    try {
                        // 存储消息
                        await storeMessage(
                            data.type,
                            data.contestId,
                            data.mode === 'team' ? ws.teamId : null,
                            ws.username,
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
                            sender: ws.username,
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
                                sender: ws.username,
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
                    // 转义 HTML
                    data.message = escapeHtml(data.message);

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
            if (ws.isGlobal) {
                globalClients.delete(ws);
            }
        });
    });

    // WebSocket 心跳检测
    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    wss.on('close', () => {
        clearInterval(interval);
    });

    // 定时检查比赛是否超时
    setInterval(async () => {
        try {
            const timeLimit = config.content.timeLimit;
            // 查询所有进行中且已超时的比赛
            // startTime 为 DATETIME，我们需要将其转换为秒进行比较
            const [contests] = await pool.query(
                'SELECT url, startTime FROM contest WHERE status = 1'
            );

            const now = Date.now();
            for (const contest of contests) {
                const startTime = new Date(contest.startTime).getTime();
                if (now - startTime > timeLimit * 1000) {
                    logger.info(`server: Contest ${contest.url} timed out, forcing finalize (draw)...`);
                    try {
                        const result = await finalizeContest(contest.url, true);
                        if (result.success && result.message !== '比赛已经结算') {
                            // 广播比赛结束消息，触发系统消息生成和持久化
                            app.emit('broadcast', {
                                type: 'contest_update',
                                contestId: contest.url,
                                action: 'end',
                                status: 2,
                                data: { message: '比赛已达最大时长，强制结束' },
                                ratingChanges: result.ratingChanges,
                                timestamp: new Date().toISOString()
                            });
                        }
                    } catch (err) {
                        logger.error(`server: Failed to auto-finalize contest ${contest.url}:`, err);
                    }
                }
            }
        } catch (err) {
            logger.error('server: Error in contest timeout check interval:', err);
        }
    }, 10000); // 每 10 秒检查一次

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
