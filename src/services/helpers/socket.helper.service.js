let io = null;

const setupSocket = (server, socketConfig = {}) => {
    const { Server } = require('socket.io');
    io = new Server(server, {
        ...socketConfig,
        path: '/socket.io',
        pingInterval: 25000,
        pingTimeout: 60000,
        connectionStateRecovery: {
            maxDisconnectionDuration: 2 * 60 * 1000,
        }
    });

    io.of('/').on('connection', (socket) => {
        console.log('New client connected:', socket.id);

        socket.on('join-thread', (threadId) => {
            socket.join(`thread:${threadId}`);
        });

        socket.on('join-agent', (agentId) => {
            socket.join(`agent:${agentId}`);
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });

    return io;
};

const emitToThread = (threadId, data) => {
    if (!io) { console.warn('Socket.IO not initialized'); return; }
    io.of('/').to(`thread:${threadId}`).emit('new-message', data);
    console.log(`Emitted new-message to thread ${threadId}`);
};

const emitToAgent = (agentId, data) => {
    if (!io) { console.warn('Socket.IO not initialized'); return; }
    io.of('/').to(`agent:${agentId}`).emit('new-thread', data);
};

module.exports = {
    setupSocket,
    emitToThread,
    emitToAgent
};
