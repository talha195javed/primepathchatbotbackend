const chatModel = require('../models/chat.model');
const { emitToThread } = require('./helpers/socket.helper.service');
const { generateAgentMessage } = require('./agent.service');

const generateBotResponse = async ({ threadId, threadData = null, signal = null }) => {
    console.log('Generating bot response for thread:', threadId);

    // Get chat history
    const pastMessages = await getChatHistory(threadId, 10, 0);
    const chatHistory = pastMessages.reverse().map(msg => ({
        role: msg.role,
        content: msg.content,
        createdAt: new Date(msg.createdAt)
    }));

    // Get thread details
    let threadFullDetails = threadData;
    if (!threadFullDetails) {
        threadFullDetails = await chatModel.getThreadById({ threadId });
    }

    if (!threadFullDetails?.agentId) {
        return { botResponse: 'Agent not assigned' };
    }

    if (signal?.aborted) {
        const error = new Error('Generation cancelled');
        error.name = 'AbortError';
        throw error;
    }

    // Generate AI response
    const botReply = await generateAgentMessage({
        threadId,
        messages: chatHistory,
        agentId: threadFullDetails.agentId,
        companyId: threadFullDetails.companyId,
        customerId: threadFullDetails.customerId,
        customerName: threadFullDetails.customerName,
        customerPhone: threadFullDetails.customerPhone,
        customerLocation: threadFullDetails.customerLocation,
        signal
    });

    return { botResponse: botReply };
};

const getChatHistory = async (threadId, limit = 1000, offset = 0) => {
    try {
        if (!threadId) throw { statusCode: 400, message: 'Thread id is required' };

        const threadExists = await chatModel.checkThreadExists(threadId);
        if (!threadExists) throw { statusCode: 404, message: 'Thread not found' };

        return await chatModel.getChatHistory({ threadId, limit: Number(limit), offset: Number(offset) });
    } catch (err) {
        console.error(`Error in getChatHistory for threadId ${threadId}:`, err);
        throw err;
    }
};

const saveAndEmitMessage = async ({ threadId, role, content, channel }) => {
    try {
        const { agent_id } = await chatModel.getThreadHandlerData(threadId);

        const msgId = await chatModel.saveMessage({ thread_id: threadId, role, content, agent_id });

        emitToThread(threadId, {
            id: msgId,
            threadId,
            content,
            role,
            status: 'sent',
            createdAt: new Date().toISOString(),
            agent_id
        });

        return msgId;
    } catch (err) {
        console.error(`Error in saveAndEmitMessage for threadId ${threadId}:`, err.message);
        throw err;
    }
};

module.exports = {
    generateBotResponse,
    getChatHistory,
    saveAndEmitMessage
};
