const agentModel = require('../models/agent.model');
const { getEmbedding } = require('./helpers/embedding.helper.service');
const { generateAIResponse } = require('../utils/ai-completion');
const promptsHelperService = require('./helpers/prompts.helper.service');

const getWidgetById = async (widgetId) => {
    return agentModel.getWidgetById(widgetId);
};

const generateAgentMessage = async ({ agentId, messages, companyId, customerId, customerName = 'Visitor', threadId = null, selectedModel = null, customerPhone = null, customerLocation = null, signal = null }) => {
    try {
        const customerMessages = messages.filter(m => m.role === 'customer');
        const lastTeamMessageIndex = messages.map(m => m.role).lastIndexOf('team');

        let lastUserMessages;
        if (lastTeamMessageIndex === -1) {
            lastUserMessages = customerMessages;
        } else {
            lastUserMessages = messages.slice(lastTeamMessageIndex + 1)
                .filter(m => m.role === 'customer');
        }

        const lastUserMessage = lastUserMessages
            .map(m => m.content.trim())
            .join('. ') + '.';

        const baseDate = new Date();

        // Greeting detection — skip RAG for simple greetings
        const greetings = ["hi", "hello", "hey", "good morning", "good afternoon", "good evening"];
        const normalized = lastUserMessage.trim().toLowerCase().replace(/[^\w\s]/g, "");
        const isGreetingOnly = greetings.some(g => normalized === g);

        if (signal?.aborted) {
            const error = new Error('Generation cancelled');
            error.name = 'AbortError';
            throw error;
        }

        if (isGreetingOnly) {
            const agentData = await agentModel.getAgentInstructionsById(agentId);
            if (!agentData?.bot_instructions) throw new Error('Agent instructions not found');

            const simplePrompt = promptsHelperService.buildGreetingPrompt({
                botInstructions: agentData.bot_instructions,
                customerName,
                customerPhone,
                customerLocation,
                lastUserMessage
            });

            const assistantMessage = await generateAIResponse(
                [
                    { role: "system", content: simplePrompt },
                    { role: "user", content: lastUserMessage }
                ],
                {
                    model: selectedModel || agentData.model,
                    temperature: parseFloat(agentData.temperature) || 0.7,
                    max_tokens: 150,
                    signal
                }
            );

            return assistantMessage;
        }

        // Normal flow with RAG embeddings
        const queryEmbedding = await getEmbedding(lastUserMessage);
        const chunks = await agentModel.getChunksByAgentId(agentId);

        const validChunks = chunks
            .map(chunk => ({
                ...chunk,
                embedding: safeParseEmbedding(chunk.embedding)
            }))
            .filter(c => c.embedding?.length);

        const scoredChunks = validChunks.map(c => ({
            ...c,
            similarity: cosineSimilarity(queryEmbedding, c.embedding)
        }));

        const topChunks = scoredChunks
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 3);

        let expandedChunks = [];
        for (const c of topChunks) {
            const neighbors = await agentModel.getNeighborChunks(c.file_id, c.order_index);
            neighbors.forEach(n => {
                expandedChunks.push({ chunk_text: n.chunk_text, embedding: n.embedding });
            });
        }

        const uniqueChunks = [];
        const seen = new Set();
        for (const ch of expandedChunks) {
            const key = ch.chunk_text.trim();
            if (!seen.has(key)) {
                seen.add(key);
                uniqueChunks.push(ch);
            }
        }

        const agentData = await agentModel.getAgentInstructionsById(agentId);
        if (!agentData?.bot_instructions) throw new Error('Agent instructions not found');

        const recentMessages = messages
            .slice(-15)
            .map(m => `${m.role.toUpperCase()}: ${m.content}`)
            .join("\n");

        const finalPrompt = promptsHelperService.buildAgentChatPrompt({
            botInstructions: agentData.bot_instructions,
            uniqueChunks,
            recentMessages,
            baseDate,
            customerLocation,
            customerName,
            customerPhone
        });

        const temp = parseFloat(agentData.temperature) || 0.7;

        const assistantMessage = await generateAIResponse(
            [
                { role: "system", content: finalPrompt },
                { role: "user", content: lastUserMessage }
            ],
            {
                model: selectedModel || agentData.model,
                temperature: temp,
                max_tokens: 400,
                signal
            }
        );

        return assistantMessage;

    } catch (error) {
        console.error("Error in generateAgentMessage:", error.message);
        return "I apologize, but I'm having trouble processing your request.";
    }
};

const safeParseEmbedding = (embedding) => {
    if (Array.isArray(embedding)) return embedding;
    if (typeof embedding === 'string') {
        try { return JSON.parse(embedding); } catch (e) { return []; }
    }
    return [];
};

const cosineSimilarity = (vecA, vecB) => {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] ** 2;
        normB += vecB[i] ** 2;
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

module.exports = {
    getWidgetById,
    generateAgentMessage
};
