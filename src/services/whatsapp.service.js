const { pool } = require('../config/db.config');
const axios = require('axios');

class WhatsAppService {
    constructor() {
        this.apiVersion = 'v18.0';
        this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
    }

    // Get WhatsApp configuration for a company
    async getWhatsAppConfig(companyId) {
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(
                'SELECT * FROM whatsapp_configs WHERE company_id = ? AND is_active = TRUE',
                [companyId]
            );
            return rows[0] || null;
        } finally {
            conn.release();
        }
    }

    // Save WhatsApp configuration
    async saveWhatsAppConfig(companyId, config) {
        const conn = await pool.getConnection();
        try {
            const id = require('uuid').v4();
            await conn.query(`
                INSERT INTO whatsapp_configs (
                    id, company_id, phone_number_id, access_token, 
                    webhook_verify_token, phone_number, business_account_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                phone_number_id = VALUES(phone_number_id),
                access_token = VALUES(access_token),
                webhook_verify_token = VALUES(webhook_verify_token),
                phone_number = VALUES(phone_number),
                business_account_id = VALUES(business_account_id),
                updated_at = CURRENT_TIMESTAMP(3)
            `, [
                id, companyId, config.phoneNumberId, config.accessToken,
                config.webhookVerifyToken, config.phoneNumber, config.businessAccountId
            ]);
            return id;
        } finally {
            conn.release();
        }
    }

    // Send text message via WhatsApp
    async sendMessage(phoneNumberId, accessToken, to, message) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/${phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to: to.replace(/[^\d]/g, ''), // Remove non-digits
                    type: 'text',
                    text: {
                        body: message
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response.data;
        } catch (error) {
            console.error('WhatsApp send message error:', error.response?.data || error.message);
            throw error;
        }
    }

    // Send template message
    async sendTemplateMessage(phoneNumberId, accessToken, to, templateName, components = []) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/${phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to: to.replace(/[^\d]/g, ''),
                    type: 'template',
                    template: {
                        name: templateName,
                        language: {
                            code: 'en'
                        },
                        components: components
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response.data;
        } catch (error) {
            console.error('WhatsApp send template error:', error.response?.data || error.message);
            throw error;
        }
    }

    // Mark message as read
    async markAsRead(phoneNumberId, accessToken, messageId) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/${phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    status: 'read',
                    message_id: messageId
                },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response.data;
        } catch (error) {
            console.error('WhatsApp mark as read error:', error.response?.data || error.message);
            throw error;
        }
    }

    // Verify webhook
    verifyWebhook(mode, token, challenge) {
        return token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && mode === 'subscribe';
    }

    // Process incoming WhatsApp message
    async processIncomingMessage(body) {
        if (!body.object || !body.entry) {
            return null;
        }

        const changes = body.entry[0]?.changes;
        if (!changes || !changes[0]?.value?.messages) {
            return null;
        }

        const message = changes[0].value.messages[0];
        const from = message.from;
        const messageId = message.id;
        const timestamp = message.timestamp;

        // Extract message content based on type
        let content = null;
        let messageType = message.type;

        switch (message.type) {
            case 'text':
                content = message.text.body;
                break;
            case 'image':
                content = '📷 Image message received';
                break;
            case 'audio':
                content = '🎵 Audio message received';
                break;
            case 'video':
                content = '🎥 Video message received';
                break;
            case 'document':
                content = '📄 Document message received';
                break;
            case 'location':
                content = `📍 Location: ${message.location.latitude}, ${message.location.longitude}`;
                break;
            case 'contacts':
                content = '👥 Contact message received';
                break;
            case 'interactive':
                if (message.interactive.type === 'button_reply') {
                    content = message.interactive.button_reply.title;
                } else if (message.interactive.type === 'list_reply') {
                    content = message.interactive.list_reply.title;
                }
                break;
            default:
                content = `Unsupported message type: ${message.type}`;
        }

        // Get phone number ID from metadata
        const metadata = changes[0].value.metadata;
        const phoneNumberId = metadata.phone_number_id;
        const displayPhoneNumber = metadata.display_phone_number;

        return {
            from,
            messageId,
            timestamp,
            content,
            messageType,
            phoneNumberId,
            displayPhoneNumber,
            rawMessage: message
        };
    }

    // Create or get customer from WhatsApp number
    async getOrCreateCustomer(companyId, phoneNumber, name = null) {
        const conn = await pool.getConnection();
        try {
            // Check if customer exists
            const [existing] = await conn.query(
                'SELECT * FROM customers WHERE company_id = ? AND phone = ?',
                [companyId, phoneNumber]
            );

            if (existing.length > 0) {
                return existing[0];
            }

            // Create new customer
            const customerId = require('uuid').v4();
            await conn.query(`
                INSERT INTO customers (id, company_id, name, phone, code)
                VALUES (?, ?, ?, ?, ?)
            `, [
                customerId,
                companyId,
                name || `WhatsApp User ${phoneNumber.slice(-4)}`,
                phoneNumber,
                Math.random().toString(36).substring(2, 7).toUpperCase()
            ]);

            return { id: customerId, company_id: companyId, name, phone: phoneNumber };
        } finally {
            conn.release();
        }
    }

    // Create WhatsApp chat thread
    async createWhatsAppThread(companyId, agentId, customerId, phoneNumberId) {
        const conn = await pool.getConnection();
        try {
            const threadId = require('uuid').v4();
            await conn.query(`
                INSERT INTO chat_threads (id, agent_id, customer_id, channel, current_handler)
                VALUES (?, ?, ?, 'whatsapp', 'assistant')
            `, [threadId, agentId, customerId]);

            return threadId;
        } finally {
            conn.release();
        }
    }

    // Save WhatsApp message to database
    async saveWhatsAppMessage(threadId, role, content, messageId = null) {
        const conn = await pool.getConnection();
        try {
            const msgId = messageId || require('uuid').v4();
            await conn.query(`
                INSERT INTO chat_messages (id, thread_id, role, content, status)
                VALUES (?, ?, ?, ?, 'sent')
            `, [msgId, threadId, role, content]);

            return msgId;
        } finally {
            conn.release();
        }
    }

    // Get thread by WhatsApp phone number
    async getThreadByPhoneNumber(companyId, phoneNumber) {
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(`
                SELECT ct.* FROM chat_threads ct
                JOIN customers c ON ct.customer_id = c.id
                WHERE ct.company_id = ? AND c.phone = ? AND ct.channel = 'whatsapp' AND ct.is_active = TRUE
                ORDER BY ct.created_at DESC
                LIMIT 1
            `, [companyId, phoneNumber]);

            return rows[0] || null;
        } finally {
            conn.release();
        }
    }

    // Send meeting confirmation via WhatsApp
    async sendMeetingConfirmation(companyId, phoneNumber, meetingDetails) {
        const config = await this.getWhatsAppConfig(companyId);
        if (!config) {
            throw new Error('WhatsApp not configured for this company');
        }

        const message = `📅 *Meeting Confirmed!*

*Title:* ${meetingDetails.title}
*Date:* ${new Date(meetingDetails.start_time).toLocaleDateString()}
*Time:* ${new Date(meetingDetails.start_time).toLocaleTimeString()} - ${new Date(meetingDetails.end_time).toLocaleTimeString()}
*Location:* ${meetingDetails.google_meet_link ? 'Google Meet - Link below' : 'In-person'}

${meetingDetails.google_meet_link ? `*Google Meet Link:* ${meetingDetails.google_meet_link}` : ''}

We'll send you a reminder 1 hour before the meeting. Looking forward to speaking with you!`;

        return await this.sendMessage(
            config.phone_number_id,
            config.access_token,
            phoneNumber,
            message
        );
    }

    // Send meeting reminder
    async sendMeetingReminder(companyId, phoneNumber, meetingDetails, reminderType) {
        const config = await this.getWhatsAppConfig(companyId);
        if (!config) {
            throw new Error('WhatsApp not configured for this company');
        }

        let message = '';
        const startTime = new Date(meetingDetails.start_time);
        const timeUntilMeeting = startTime - new Date();

        if (reminderType === '24h') {
            message = `📅 *Reminder: Meeting Tomorrow*

*Title:* ${meetingDetails.title}
*Date:* ${startTime.toLocaleDateString()}
*Time:* ${startTime.toLocaleTimeString()}

We'll send another reminder 1 hour before the meeting.`;
        } else if (reminderType === '1h') {
            message = `⏰ *Reminder: Meeting in 1 Hour*

*Title:* ${meetingDetails.title}
*Time:* ${startTime.toLocaleTimeString()}

${meetingDetails.google_meet_link ? `*Google Meet Link:* ${meetingDetails.google_meet_link}` : ''}

Get ready! We'll send the meeting link 10 minutes before we start.`;
        } else if (reminderType === '10m') {
            message = `🚀 *Meeting Starting Soon!*

*Title:* ${meetingDetails.title}
*Time:* ${startTime.toLocaleTimeString()}

${meetingDetails.google_meet_link ? `*Join Google Meet:* ${meetingDetails.google_meet_link}` : ''}

Click the link above to join the meeting!`;
        }

        return await this.sendMessage(
            config.phone_number_id,
            config.access_token,
            phoneNumber,
            message
        );
    }
}

module.exports = new WhatsAppService();
