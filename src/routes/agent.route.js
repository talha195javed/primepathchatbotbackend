const express = require('express');
const router = express.Router();
const { getWidgetById } = require('../controllers/agent.control');

router.get('/get-widget', getWidgetById);

module.exports = router;
