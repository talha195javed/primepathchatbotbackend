const express = require('express');
const router = express.Router();
const { webChatHandler, getChatHistory } = require('../controllers/chat.control');

router.post('/chat-web', webChatHandler);
router.get('/chat-history', getChatHistory);

module.exports = router;
