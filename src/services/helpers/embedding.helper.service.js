const openai = require('../../config/chatgpt.config');

const getEmbedding = async (text, timeout = 30000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text
        }, { signal: controller.signal });
        return response.data[0].embedding;
    } finally {
        clearTimeout(timeoutId);
    }
};

module.exports = { getEmbedding };
