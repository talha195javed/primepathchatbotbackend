const express = require('express');
const router = express.Router();
const { login, me } = require('../controllers/auth.control');
const { authenticate } = require('../middleware/auth.middleware');

router.post('/login', login);
router.get('/me', authenticate, me);

module.exports = router;
