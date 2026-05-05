const cron = require('node-cron');
const meetingsService = require('./meetings.service');
const { pool } = require('../config/db.config');
const whatsappService = require('./whatsapp.service');

class ReminderService {
    constructor() {
        this.isRunning = false;
        this.jobs = new Map();
    }

    // Start the reminder engine
    start() {
        if (this.isRunning) {
            console.log('Reminder service is already running');
            return;
        }

        console.log('Starting reminder service...');
        this.isRunning = true;

        // Run every minute to check for reminders
        this.jobs.set('main', cron.schedule('* * * * *', async () => {
            try {
                await this.processReminders();
            } catch (error) {
                console.error('Error processing reminders:', error);
            }
        }));

        // Run every hour to check for follow-up reminders
        this.jobs.set('followups', cron.schedule('0 * * * *', async () => {
            try {
                await this.processFollowUpReminders();
            } catch (error) {
                console.error('Error processing follow-up reminders:', error);
            }
        }));

        // Run daily at 9 AM to check for inactive leads
        this.jobs.set('inactive-leads', cron.schedule('0 9 * * *', async () => {
            try {
                await this.processInactiveLeads();
            } catch (error) {
                console.error('Error processing inactive leads:', error);
            }
        }));

        console.log('Reminder service started successfully');
    }

    // Stop the reminder engine
    stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('Stopping reminder service...');
        this.isRunning = false;

        this.jobs.forEach(job => job.stop());
        this.jobs.clear();

        console.log('Reminder service stopped');
    }

    // Process meeting reminders
    async processReminders() {
        try {
            const result = await meetingsService.processReminders();
            
            if (result.processed24h > 0 || result.processed1h > 0 || result.processed10m > 0) {
                console.log(`Processed ${result.processed24h} 24h reminders, ${result.processed1h} 1h reminders, ${result.processed10m} 10m reminders`);
            }
        } catch (error) {
            console.error('Error processing meeting reminders:', error);
        }
    }

    // Process follow-up reminders for leads
    async processFollowUpReminders() {
        const conn = await pool.getConnection();
        try {
            // Find leads that need follow-up (no contact in 24 hours)
            const [rows] = await conn.query(`
                SELECT l.*, c.name as customer_name, c.phone as customer_phone, 
                       c.email as customer_email, comp.name as company_name,
                       a.name as agent_name, a.bot_instructions
                FROM leads l
                JOIN customers c ON l.customer_id = c.id
                JOIN companies comp ON l.company_id = comp.id
                LEFT JOIN agents a ON l.assigned_agent_id = a.id
                WHERE l.status IN ('new', 'contacted', 'qualified')
                AND (l.last_contacted_at IS NULL 
                     OR l.last_contacted_at < DATE_SUB(NOW(), INTERVAL 24 HOUR))
                AND l.last_follow_up_sent_at IS NULL 
                OR l.last_follow_up_sent_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
            `);

            for (const lead of rows) {
                try {
                    await this.sendFollowUpReminder(lead);
                    
                    // Update last follow-up time
                    await conn.query(`
                        UPDATE leads 
                        SET last_follow_up_sent_at = CURRENT_TIMESTAMP(3)
                        WHERE id = ?
                    `, [lead.id]);
                } catch (error) {
                    console.error(`Failed to send follow-up for lead ${lead.id}:`, error);
                }
            }

            if (rows.length > 0) {
                console.log(`Processed ${rows.length} follow-up reminders`);
            }
        } finally {
            conn.release();
        }
    }

    // Process inactive leads (no contact in 7 days)
    async processInactiveLeads() {
        const conn = await pool.getConnection();
        try {
            // Find inactive leads
            const [rows] = await conn.query(`
                SELECT l.*, c.name as customer_name, c.phone as customer_phone, 
                       c.email as customer_email, comp.name as company_name
                FROM leads l
                JOIN customers c ON l.customer_id = c.id
                JOIN companies comp ON l.company_id = comp.id
                WHERE l.status IN ('new', 'contacted', 'qualified')
                AND (l.last_contacted_at IS NULL 
                     OR l.last_contacted_at < DATE_SUB(NOW(), INTERVAL 7 DAY))
                AND l.inactive_reminder_sent_at IS NULL
            `);

            for (const lead of rows) {
                try {
                    await this.sendInactiveLeadReminder(lead);
                    
                    // Update inactive reminder time
                    await conn.query(`
                        UPDATE leads 
                        SET inactive_reminder_sent_at = CURRENT_TIMESTAMP(3)
                        WHERE id = ?
                    `, [lead.id]);
                } catch (error) {
                    console.error(`Failed to send inactive reminder for lead ${lead.id}:`, error);
                }
            }

            if (rows.length > 0) {
                console.log(`Processed ${rows.length} inactive lead reminders`);
            }
        } finally {
            conn.release();
        }
    }

    // Send follow-up reminder
    async sendFollowUpReminder(lead) {
        const message = `🔄 *Follow-up Reminder*

*Lead:* ${lead.customer_name}
*Status:* ${lead.status}
*Score:* ${lead.score || 0}

${lead.notes ? `*Notes:* ${lead.notes}` : ''}

This lead hasn't been contacted in 24 hours. Consider following up to move them forward in your sales process.`;

        // Send to assigned agent if available
        if (lead.assigned_agent_id) {
            await this.notifyAgent(lead.company_id, lead.assigned_agent_id, message);
        }

        // Send WhatsApp to customer if phone available
        if (lead.customer_phone) {
            try {
                const customerMessage = `Hi ${lead.customer_name}, just checking in! 

I wanted to follow up on your recent inquiry. Is there anything specific you'd like to know more about?

Feel free to reply here or schedule a call with us!`;

                await whatsappService.sendMessage(
                    lead.company_id,
                    lead.customer_phone,
                    customerMessage
                );
            } catch (error) {
                console.error('Failed to send WhatsApp follow-up:', error);
            }
        }

        // Emit to admin panel
        const { getSocket } = require('./helpers/socket.helper.service');
        const io = getSocket();
        io.to(`company-${lead.company_id}`).emit('follow-up-reminder', {
            leadId: lead.id,
            customerName: lead.customer_name,
            status: lead.status
        });
    }

    // Send inactive lead reminder
    async sendInactiveLeadReminder(lead) {
        const message = `⚠️ *Inactive Lead Alert*

*Lead:* ${lead.customer_name}
*Status:* ${lead.status}
*Score:* ${lead.score || 0}
*Last Contact:* ${lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleDateString() : 'Never'}

This lead has been inactive for 7+ days. Consider re-engaging or marking as lost.`;

        // Send to company admins
        await this.notifyCompanyAdmins(lead.company_id, message);

        // Emit to admin panel
        const { getSocket } = require('./helpers/socket.helper.service');
        const io = getSocket();
        io.to(`company-${lead.company_id}`).emit('inactive-lead-alert', {
            leadId: lead.id,
            customerName: lead.customer_name,
            lastContacted: lead.last_contacted_at
        });
    }

    // Notify specific agent
    async notifyAgent(companyId, agentId, message) {
        const { getSocket } = require('./helpers/socket.helper.service');
        const io = getSocket();
        
        io.to(`agent-${agentId}`).emit('notification', {
            type: 'follow-up',
            message,
            timestamp: new Date().toISOString()
        });
    }

    // Notify company admins
    async notifyCompanyAdmins(companyId, message) {
        const conn = await pool.getConnection();
        try {
            const [adminRows] = await conn.query(`
                SELECT id FROM users 
                WHERE company_id = ? AND role IN ('client', 'super_admin') AND is_active = TRUE
            `, [companyId]);

            const { getSocket } = require('./helpers/socket.helper.service');
            const io = getSocket();

            for (const admin of adminRows) {
                io.to(`user-${admin.id}`).emit('notification', {
                    type: 'alert',
                    message,
                    timestamp: new Date().toISOString()
                });
            }
        } finally {
            conn.release();
        }
    }

    // Schedule custom reminder
    async scheduleCustomReminder(reminderData) {
        const conn = await pool.getConnection();
        try {
            const reminderId = require('uuid').v4();
            
            await conn.query(`
                INSERT INTO custom_reminders (
                    id, company_id, user_id, title, message, 
                    scheduled_for, reminder_type, is_sent
                ) VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)
            `, [
                reminderId,
                reminderData.companyId,
                reminderData.userId,
                reminderData.title,
                reminderData.message,
                reminderData.scheduledFor,
                reminderData.type || 'general'
            ]);

            return reminderId;
        } finally {
            conn.release();
        }
    }

    // Process custom reminders
    async processCustomReminders() {
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(`
                SELECT cr.*, u.name as user_name, comp.name as company_name
                FROM custom_reminders cr
                JOIN users u ON cr.user_id = u.id
                JOIN companies comp ON cr.company_id = comp.id
                WHERE cr.is_sent = FALSE 
                AND cr.scheduled_for <= NOW()
            `);

            for (const reminder of rows) {
                try {
                    await this.sendCustomReminder(reminder);
                    
                    // Mark as sent
                    await conn.query(
                        'UPDATE custom_reminders SET is_sent = TRUE WHERE id = ?',
                        [reminder.id]
                    );
                } catch (error) {
                    console.error(`Failed to send custom reminder ${reminder.id}:`, error);
                }
            }

            if (rows.length > 0) {
                console.log(`Processed ${rows.length} custom reminders`);
            }
        } finally {
            conn.release();
        }
    }

    // Send custom reminder
    async sendCustomReminder(reminder) {
        const { getSocket } = require('./helpers/socket.helper.service');
        const io = getSocket();
        
        io.to(`user-${reminder.user_id}`).emit('notification', {
            type: 'reminder',
            title: reminder.title,
            message: reminder.message,
            timestamp: new Date().toISOString()
        });

        // Send WhatsApp if configured and user has phone
        if (reminder.reminder_type === 'whatsapp') {
            // Implementation would depend on user phone number storage
        }
    }

    // Get reminder statistics
    async getReminderStats(companyId, startDate, endDate) {
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(`
                SELECT 
                    COUNT(*) as total_reminders,
                    SUM(CASE WHEN reminder_sent_24h = TRUE THEN 1 ELSE 0 END) as sent_24h,
                    SUM(CASE WHEN reminder_sent_1h = TRUE THEN 1 ELSE 0 END) as sent_1h,
                    SUM(CASE WHEN reminder_sent_10m = TRUE THEN 1 ELSE 0 END) as sent_10m,
                    DATE(start_time) as reminder_date
                FROM meetings 
                WHERE company_id = ? 
                AND start_time BETWEEN ? AND ?
                GROUP BY DATE(start_time)
                ORDER BY reminder_date DESC
            `, [companyId, startDate, endDate]);

            return rows;
        } finally {
            conn.release();
        }
    }

    // Get service status
    getStatus() {
        return {
            isRunning: this.isRunning,
            activeJobs: Array.from(this.jobs.keys()),
            uptime: this.isRunning ? process.uptime() : 0
        };
    }
}

module.exports = new ReminderService();
