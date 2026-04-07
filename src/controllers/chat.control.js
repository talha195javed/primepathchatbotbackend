const chatService = require('../services/chat.service');
const { getThreadById, reactivateThread } = require('../models/chat.model');

const webChatHandler = async (req, res) => {
    const { threadId, message } = req.body;

    if (!threadId || !message) {
        return res.status(400).json({ error: 'threadId and message are required' });
    }

    try {
        // Save user message
        await chatService.saveAndEmitMessage({
            threadId,
            role: 'customer',
            content: message,
            channel: 'web'
        });

        const threadData = await getThreadById({ threadId });
        if (!threadData.isActive) {
            await reactivateThread(threadId);
        }

        // Respond immediately
        res.json({ threadId, botResponse: 'BOT' });

        // Generate and emit bot response asynchronously
        chatService.generateBotResponse({ threadId, threadData })
            .then(({ botResponse }) => {
                chatService.saveAndEmitMessage({
                    threadId,
                    role: 'team',
                    content: botResponse,
                    channel: 'web'
                });
            })
            .catch(err => {
                console.error('Bot response generation error:', err);
            });

    } catch (err) {
        console.error('webChatHandler error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

const getChatHistory = async (req, res) => {
    try {
        const { threadId, offset } = req.query;
        if (!threadId) return res.status(400).json({ error: 'threadId required' });

        const messages = await chatService.getChatHistory(threadId, 50, offset || 0);
        res.json(messages);
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

module.exports = { webChatHandler, getChatHistory };
