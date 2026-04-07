const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.CHATGPT_CHUNK_API_KEY
});

module.exports = openai;
