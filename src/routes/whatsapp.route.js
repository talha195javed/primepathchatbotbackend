const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp.service');
const { authenticateToken } = require('../middleware/auth.middleware');
const { v4: uuidv4 } = require('uuid');

// WhatsApp webhook verification
router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (whatsappService.verifyWebhook(mode, token, challenge)) {
        console.log('Webhook verified successfully');
        res.status(200).send(challenge);
    } else {
        console.log('Webhook verification failed');
        res.sendStatus(403);
    }
});

// WhatsApp webhook - incoming messages
router.post('/webhook', async (req, res) => {
    try {
        const messageData = await whatsappService.processIncomingMessage(req.body);
        
        if (!messageData) {
            return res.sendStatus(200);
        }

        console.log('Received WhatsApp message:', messageData);

        // Get WhatsApp config to find company
        const { pool } = require('../config/db.config');
        const conn = await pool.getConnection();
        
        try {
            // Find company by phone number ID
            const [configRows] = await conn.query(`
                SELECT company_id FROM whatsapp_configs 
                WHERE phone_number_id = ? AND is_active = TRUE
            `, [messageData.phoneNumberId]);

            if (configRows.length === 0) {
                console.log('No configuration found for phone number ID:', messageData.phoneNumberId);
                return res.sendStatus(200);
            }

            const companyId = configRows[0].company_id;

            // Get or create customer
            const customer = await whatsappService.getOrCreateCustomer(
                companyId, 
                messageData.from
            );

            // Check for existing thread
            let thread = await whatsappService.getThreadByPhoneNumber(companyId, messageData.from);

            // If no thread exists, create one with default agent
            if (!thread) {
                // Get default agent for company
                const [agentRows] = await conn.query(`
                    SELECT id FROM agents 
                    WHERE company_id = ? AND is_active = TRUE 
                    ORDER BY created_at ASC 
                    LIMIT 1
                `, [companyId]);

                if (agentRows.length === 0) {
                    console.log('No active agent found for company:', companyId);
                    return res.sendStatus(200);
                }

                thread = await whatsappService.createWhatsAppThread(
                    companyId,
                    agentRows[0].id,
                    customer.id,
                    messageData.phoneNumberId
                );
            }

            // Save customer message
            await whatsappService.saveWhatsAppMessage(
                thread.id,
                'customer',
                messageData.content,
                messageData.messageId
            );

            // Process message with AI and send response
            const { processWhatsAppMessage } = require('../services/chat.service');
            await processWhatsAppMessage(thread.id, messageData.content, companyId);

            // Emit to socket for admin panel
            const { getSocket } = require('../services/helpers/socket.helper.service');
            const io = getSocket();
            io.to(`company-${companyId}`).emit('new-whatsapp-message', {
                threadId: thread.id,
                customerId: customer.id,
                customerName: customer.name,
                content: messageData.content,
                timestamp: new Date().toISOString()
            });

        } finally {
            conn.release();
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('WhatsApp webhook error:', error);
        res.sendStatus(500);
    }
});

// Configure WhatsApp for company (admin only)
router.post('/configure', authenticateToken, async (req, res) => {
    try {
        const { 
            phoneNumberId, 
            accessToken, 
            webhookVerifyToken, 
            phoneNumber, 
            businessAccountId 
        } = req.body;

        if (!phoneNumberId || !accessToken || !webhookVerifyToken || !phoneNumber) {
            return res.status(400).json({ 
                error: 'Missing required fields: phoneNumberId, accessToken, webhookVerifyToken, phoneNumber' 
            });
        }

        const companyId = req.user.company_id || req.user.id;
        
        const configId = await whatsappService.saveWhatsAppConfig(companyId, {
            phoneNumberId,
            accessToken,
            webhookVerifyToken,
            phoneNumber,
            businessAccountId
        });

        res.json({ 
            success: true, 
            configId,
            message: 'WhatsApp configuration saved successfully' 
        });
    } catch (error) {
        console.error('WhatsApp configuration error:', error);
        res.status(500).json({ error: 'Failed to save WhatsApp configuration' });
    }
});

// Get WhatsApp configuration
router.get('/config', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.company_id || req.user.id;
        const config = await whatsappService.getWhatsAppConfig(companyId);
        
        if (!config) {
            return res.status(404).json({ error: 'WhatsApp not configured' });
        }

        // Don't send sensitive data to client
        const { access_token, webhook_verify_token, ...safeConfig } = config;
        res.json(safeConfig);
    } catch (error) {
        console.error('Get WhatsApp config error:', error);
        res.status(500).json({ error: 'Failed to get WhatsApp configuration' });
    }
});

// Send test message
router.post('/send-test', authenticateToken, async (req, res) => {
    try {
        const { to, message } = req.body;
        
        if (!to || !message) {
            return res.status(400).json({ error: 'Missing required fields: to, message' });
        }

        const companyId = req.user.company_id || req.user.id;
        const config = await whatsappService.getWhatsAppConfig(companyId);
        
        if (!config) {
            return res.status(404).json({ error: 'WhatsApp not configured' });
        }

        const result = await whatsappService.sendMessage(
            config.phone_number_id,
            config.access_token,
            to,
            message
        );

        res.json({ success: true, result });
    } catch (error) {
        console.error('Send test message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Send meeting confirmation
router.post('/send-meeting-confirmation', authenticateToken, async (req, res) => {
    try {
        const { customerId, meetingDetails } = req.body;
        
        if (!customerId || !meetingDetails) {
            return res.status(400).json({ error: 'Missing required fields: customerId, meetingDetails' });
        }

        const companyId = req.user.company_id || req.user.id;
        
        // Get customer phone number
        const { pool } = require('../config/db.config');
        const conn = await pool.getConnection();
        
        try {
            const [customerRows] = await conn.query(
                'SELECT phone FROM customers WHERE id = ? AND company_id = ?',
                [customerId, companyId]
            );

            if (customerRows.length === 0) {
                return res.status(404).json({ error: 'Customer not found' });
            }

            const phoneNumber = customerRows[0].phone;
            
            const result = await whatsappService.sendMeetingConfirmation(
                companyId,
                phoneNumber,
                meetingDetails
            );

            res.json({ success: true, result });
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error('Send meeting confirmation error:', error);
        res.status(500).json({ error: 'Failed to send meeting confirmation' });
    }
});

// Send meeting reminder
router.post('/send-reminder', authenticateToken, async (req, res) => {
    try {
        const { customerId, meetingDetails, reminderType } = req.body;
        
        if (!customerId || !meetingDetails || !reminderType) {
            return res.status(400).json({ error: 'Missing required fields: customerId, meetingDetails, reminderType' });
        }

        const companyId = req.user.company_id || req.user.id;
        
        // Get customer phone number
        const { pool } = require('../config/db.config');
        const conn = await pool.getConnection();
        
        try {
            const [customerRows] = await conn.query(
                'SELECT phone FROM customers WHERE id = ? AND company_id = ?',
                [customerId, companyId]
            );

            if (customerRows.length === 0) {
                return res.status(404).json({ error: 'Customer not found' });
            }

            const phoneNumber = customerRows[0].phone;
            
            const result = await whatsappService.sendMeetingReminder(
                companyId,
                phoneNumber,
                meetingDetails,
                reminderType
            );

            res.json({ success: true, result });
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error('Send reminder error:', error);
        res.status(500).json({ error: 'Failed to send reminder' });
    }
});

module.exports = router;
