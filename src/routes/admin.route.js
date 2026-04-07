const express = require('express');
const router = express.Router();
const { authenticate, requireSuperAdmin, requireClient } = require('../middleware/auth.middleware');
const admin = require('../controllers/admin.control');

// Dashboard
router.get('/dashboard', authenticate, requireClient, admin.getDashboardStats);

// Clients (super admin only)
router.get('/clients', authenticate, requireSuperAdmin, admin.getAllClients);
router.post('/clients', authenticate, requireSuperAdmin, admin.createClient);

// Companies (super admin only)
router.get('/companies', authenticate, requireSuperAdmin, admin.getAllCompanies);

// Agents (client + super admin)
router.get('/agents', authenticate, requireClient, admin.getAgents);
router.get('/agents/:agentId', authenticate, requireClient, admin.getAgentDetail);
router.post('/agents', authenticate, requireClient, admin.createAgent);
router.put('/agents/:agentId', authenticate, requireClient, admin.updateAgent);

// Widget settings
router.put('/widgets/:widgetId', authenticate, requireClient, admin.updateWidget);

// Chat threads
router.get('/threads', authenticate, requireClient, admin.getThreads);
router.get('/threads/:threadId/messages', authenticate, requireClient, admin.getThreadMessages);

module.exports = router;
