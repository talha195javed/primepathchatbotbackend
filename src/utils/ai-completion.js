const deepseek = require('../config/deepseek.config');
const openai = require('../config/chatgpt.config');

async function generateAIResponse(messages, options = {}) {
    const { model = 'deepseek-chat' } = options;

    try {
        let response, content;

        if (model.startsWith('deepseek')) {
            response = await deepseek.chat.completions.create({
                model,
                messages
            });
            content = response?.choices?.[0]?.message?.content || '';
        } else {
            response = await openai.responses.create({
                model,
                input: messages
            });
            content =
                response.output_text ||
                response?.output?.[0]?.content?.[0]?.text || '';
        }

        return (content || '').trim();
    } catch (error) {
        console.error(`AI response generation failed for model: ${model}`, error);
        throw error;
    }
}

module.exports = { generateAIResponse };
