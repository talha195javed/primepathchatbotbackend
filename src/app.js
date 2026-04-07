// PrimePath Chatbot Backend
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { initDB } = require('./config/db.config');
const routes = require('./routes/index.route');
const { setupSocket } = require('./services/helpers/socket.helper.service');

const app = express();
const server = http.createServer(app);

// CORS
app.use(cors());

// Socket.IO
setupSocket(server, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:4001',
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

app.set('trust proxy', 1);

// JSON body parser
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// Test route
app.get('/test', (req, res) => res.send('PrimePath Chatbot API working'));

// API routes
app.use('/api', routes);

// Error handling
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error' });
});

// Initialize database and start server
initDB().then(() => {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`PrimePath Chatbot API running on port ${PORT}`);
    });
    server.timeout = 180000;
}).catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

module.exports = { app, server };
