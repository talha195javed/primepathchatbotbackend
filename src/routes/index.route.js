const express = require('express');
const router = express.Router();

const agentRoutes = require('./agent.route');
const chatRoutes = require('./chat.route');
const customerRoutes = require('./customer.route');
const authRoutes = require('./auth.route');
const adminRoutes = require('./admin.route');
const whatsappRoutes = require('./whatsapp.route');
const googleCalendarRoutes = require('./google-calendar.route');
const meetingsRoutes = require('./meetings.route');
const stripeRoutes = require('./stripe.route');
const analyticsRoutes = require('./analytics.route');

router.use('/agent', agentRoutes);
router.use('/chat', chatRoutes);
router.use('/customer', customerRoutes);
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/google-calendar', googleCalendarRoutes);
router.use('/meetings', meetingsRoutes);
router.use('/stripe', stripeRoutes);
router.use('/analytics', analyticsRoutes);

module.exports = router;
