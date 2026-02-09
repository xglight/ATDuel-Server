// tools/contest_action_store.mjs
import logger from '../logger.mjs';

/**
 * 存储比赛动作请求（平局/认输）的内存仓库
 * 结构:
 * actions = {
 *   [contestId]: {
 *      type: 'draw' | 'surrender',
 *      requestId: string,
 *      requesterTeam: string,
 *      requesterName: string,
 *      votes: Set<string>, // 已投同意票的用户列表
 *      totalNeeded: number, // 需要的总票数
 *      expireAt: number,
 *      timer: TimeoutID
 *   }
 * }
 */
const actions = new Map();

export default {
    /**
     * 获取比赛当前的动作请求
     */
    get(contestId) {
        return actions.get(contestId);
    },

    /**
     * 创建新动作请求
     * @param {string} contestId 
     * @param {object} data 
     * @param {function} onExpire 超时回调
     */
    create(contestId, data, onExpire) {
        if (actions.has(contestId)) {
            this.clear(contestId);
        }

        const timeoutMs = 30000; // 30s 投票时间
        const expireAt = Date.now() + timeoutMs;

        const timer = setTimeout(() => {
            logger.info(`contest_action_store: Action for contest ${contestId} expired`);
            const action = actions.get(contestId);
            if (action) {
                actions.delete(contestId);
                if (onExpire) onExpire(action);
            }
        }, timeoutMs);

        const action = {
            ...data,
            votes: new Set([data.requesterName]), // 发起人自动投同意票
            expireAt,
            timer
        };

        actions.set(contestId, action);
        return action;
    },

    /**
     * 投同意票
     */
    addVote(contestId, username) {
        const action = actions.get(contestId);
        if (action) {
            action.votes.add(username);
            return action.votes.size;
        }
        return 0;
    },

    /**
     * 清除请求
     */
    clear(contestId) {
        const action = actions.get(contestId);
        if (action) {
            clearTimeout(action.timer);
            actions.delete(contestId);
        }
    }
};
