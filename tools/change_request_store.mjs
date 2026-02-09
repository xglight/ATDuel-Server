// tools/change_request_store.mjs
import logger from '../logger.mjs';

/**
 * 存储换题请求的内存仓库
 * 结构:
 * requests = {
 *   [contestId]: {
 *      requestId: string,
 *      problemId: string,
 *      problemTitle: string,
 *      requesterTeam: string, // 'A' or 'B'
 *      requesterName: string,
 *      createdAt: number,
 *      expireAt: number,
 *      timer: TimeoutID
 *   }
 * }
 */
const requests = new Map();

export default {
    /**
     * 获取比赛当前的请求
     * @param {string} contestId 
     */
    get(contestId) {
        return requests.get(contestId);
    },

    /**
     * 创建新请求
     * @param {string} contestId 
     * @param {object} data 
     * @param {function} onExpire 超时回调
     */
    create(contestId, data, onExpire) {
        // 如果已存在请求，先清除旧的（理论上应该在 Controller 层拦截）
        if (requests.has(contestId)) {
            this.clear(contestId);
        }

        const timeoutMs = 30000; // 30s
        const expireAt = Date.now() + timeoutMs;

        const timer = setTimeout(() => {
            logger.debug(`change_request_store: Request for contest ${contestId} expired`);
            const req = requests.get(contestId);
            if (req) {
                requests.delete(contestId);
                if (onExpire) onExpire(req);
            }
        }, timeoutMs);

        const request = {
            ...data,
            createdAt: Date.now(),
            expireAt,
            timer
        };

        requests.set(contestId, request);
        return request;
    },

    /**
     * 清除/完成请求
     * @param {string} contestId 
     */
    clear(contestId) {
        const req = requests.get(contestId);
        if (req) {
            clearTimeout(req.timer);
            requests.delete(contestId);
        }
    }
};
