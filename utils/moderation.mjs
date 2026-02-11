/**
 * @file 提供 AI 内容审查功能的实用程序
 */
import config from '../config.mjs';
import logger from '../logger.mjs';

/**
 * 使用 Eden AI 进行内容审查
 * @param {string} text 需要审查的文本内容
 * @returns {Promise<{isSafe: boolean, reason: string|null}>} 审查结果
 */
export async function moderateText(text) {
    if (!config.edenAI.apiKey) {
        logger.warn('moderation: EDEN_AI_API_KEY is not set, skipping moderation.');
        return { isSafe: true, reason: null };
    }

    const url = "https://api.edenai.run/v3/universal-ai/";
    const headers = {
        "Authorization": `Bearer ${config.edenAI.apiKey}`,
        "Content-Type": "application/json",
    };
    const payload = {
        "model": "text/moderation/openai/text-moderation-007",
        "input": {
            "text": text
        },
        "show_original_response": false
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (data.status === "success") {
            const output = data.output;
            // nsfw_likelihood 越高表示内容越不合规，通常 3 及以上需要注意，5 是最高
            // 这里我们设定如果 nsfw_likelihood >= 3 则认为不安全
            if (output.nsfw_likelihood >= 3) {
                // 找出最可能的违规标签
                const offensiveItems = output.items.filter(item => item.likelihood >= 3);
                const reason = offensiveItems.map(item => item.label).join(', ') || '违规内容';
                logger.info(`moderation: Text blocked. Likelihood: ${output.nsfw_likelihood}, Reasons: ${reason}`);
                return { isSafe: false, reason };
            }
            return { isSafe: true, reason: null };
        } else {
            logger.error("moderation: Eden AI API error:", data.error || 'Unknown error');
            // 如果 API 出错，为了不影响业务，默认通过
            return { isSafe: true, reason: null };
        }
    } catch (error) {
        logger.error("moderation: Fetch error:", error);
        return { isSafe: true, reason: null };
    }
}
