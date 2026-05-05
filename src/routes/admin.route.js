const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticate, requireSuperAdmin, requireClient } = require('../middleware/auth.middleware');
const admin = require('../controllers/admin.control');

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

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

// Image uploads
router.post('/upload-image', authenticate, requireClient, upload.single('image'), admin.uploadImage);

module.exports = router;
