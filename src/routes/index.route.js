const express = require('express');
const router = express.Router();

const agentRoutes = require('./agent.route');
const chatRoutes = require('./chat.route');
const customerRoutes = require('./customer.route');
const authRoutes = require('./auth.route');
const adminRoutes = require('./admin.route');

router.use('/agent', agentRoutes);
router.use('/chat', chatRoutes);
router.use('/customer', customerRoutes);
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
