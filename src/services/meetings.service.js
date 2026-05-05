const { pool } = require('../config/db.config');
const googleCalendarService = require('./google-calendar.service');
const whatsappService = require('./whatsapp.service');
const { v4: uuidv4 } = require('uuid');

class MeetingsService {
    // Create a new meeting
    async createMeeting(meetingData) {
        const conn = await pool.getConnection();
        try {
            const meetingId = uuidv4();
            
            // Create meeting record
            await conn.query(`
                INSERT INTO meetings (
                    id, company_id, customer_id, agent_id, thread_id,
                    title, description, start_time, end_time, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
            `, [
                meetingId,
                meetingData.companyId,
                meetingData.customerId,
                meetingData.agentId,
                meetingData.threadId,
                meetingData.title,
                meetingData.description,
                meetingData.startTime,
                meetingData.endTime
            ]);

            // Try to create Google Calendar event
            let calendarEvent = null;
            try {
                calendarEvent = await googleCalendarService.createEvent(
                    meetingData.companyId,
                    meetingData.agentId,
                    {
                        title: meetingData.title,
                        description: meetingData.description,
                        startTime: new Date(meetingData.startTime),
                        endTime: new Date(meetingData.endTime),
                        attendees: meetingData.attendees || [],
                        createMeet: true
                    }
                );

                // Update meeting with calendar event details
                await conn.query(`
                    UPDATE meetings 
                    SET google_calendar_event_id = ?, google_meet_link = ?
                    WHERE id = ?
                `, [
                    calendarEvent.id,
                    calendarEvent.hangoutLink,
                    meetingId
                ]);
            } catch (calendarError) {
                console.error('Failed to create calendar event:', calendarError);
                // Continue without calendar event
            }

            // Get customer details for WhatsApp notification
            const [customerRows] = await conn.query(
                'SELECT * FROM customers WHERE id = ?',
                [meetingData.customerId]
            );

            const meeting = await this.getMeetingById(meetingId);

            // Send WhatsApp confirmation if customer has phone number
            if (customerRows.length > 0 && customerRows[0].phone) {
                try {
                    await whatsappService.sendMeetingConfirmation(
                        meetingData.companyId,
                        customerRows[0].phone,
                        meeting
                    );
                } catch (whatsappError) {
                    console.error('Failed to send WhatsApp confirmation:', whatsappError);
                }
            }

            // Emit to admin panel
            const { getSocket } = require('../services/helpers/socket.helper.service');
            const io = getSocket();
            io.to(`company-${meetingData.companyId}`).emit('meeting-created', {
                meetingId,
                meeting
            });

            return meetingId;
        } finally {
            conn.release();
        }
    }

    // Get meeting by ID
    async getMeetingById(meetingId) {
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(`
                SELECT m.*, c.name as customer_name, c.phone as customer_phone,
                       a.name as agent_name, comp.name as company_name
                FROM meetings m
                JOIN customers c ON m.customer_id = c.id
                JOIN agents a ON m.agent_id = a.id
                JOIN companies comp ON m.company_id = comp.id
                WHERE m.id = ?
            `, [meetingId]);

            return rows[0] || null;
        } finally {
            conn.release();
        }
    }

    // Get meetings for company
    async getCompanyMeetings(companyId, filters = {}) {
        const conn = await pool.getConnection();
        try {
            let query = `
                SELECT m.*, c.name as customer_name, c.phone as customer_phone,
                       a.name as agent_name
                FROM meetings m
                JOIN customers c ON m.customer_id = c.id
                JOIN agents a ON m.agent_id = a.id
                WHERE m.company_id = ?
            `;
            const params = [companyId];

            // Add filters
            if (filters.status) {
                query += ' AND m.status = ?';
                params.push(filters.status);
            }

            if (filters.agentId) {
                query += ' AND m.agent_id = ?';
                params.push(filters.agentId);
            }

            if (filters.startDate) {
                query += ' AND m.start_time >= ?';
                params.push(filters.startDate);
            }

            if (filters.endDate) {
                query += ' AND m.end_time <= ?';
                params.push(filters.endDate);
            }

            query += ' ORDER BY m.start_time DESC';

            if (filters.limit) {
                query += ' LIMIT ?';
                params.push(filters.limit);
            }

            const [rows] = await conn.query(query, params);
            return rows;
        } finally {
            conn.release();
        }
    }

    // Update meeting
    async updateMeeting(meetingId, updateData) {
        const conn = await pool.getConnection();
        try {
            // Update meeting record
            const updateFields = [];
            const updateParams = [];

            if (updateData.title) {
                updateFields.push('title = ?');
                updateParams.push(updateData.title);
            }

            if (updateData.description !== undefined) {
                updateFields.push('description = ?');
                updateParams.push(updateData.description);
            }

            if (updateData.startTime) {
                updateFields.push('start_time = ?');
                updateParams.push(updateData.startTime);
            }

            if (updateData.endTime) {
                updateFields.push('end_time = ?');
                updateParams.push(updateData.endTime);
            }

            if (updateData.status) {
                updateFields.push('status = ?');
                updateParams.push(updateData.status);
            }

            if (updateFields.length === 0) {
                throw new Error('No fields to update');
            }

            updateFields.push('updated_at = CURRENT_TIMESTAMP(3)');
            updateParams.push(meetingId);

            await conn.query(`
                UPDATE meetings 
                SET ${updateFields.join(', ')}
                WHERE id = ?
            `, updateParams);

            // Update Google Calendar event if exists
            const meeting = await this.getMeetingById(meetingId);
            if (meeting && meeting.google_calendar_event_id) {
                try {
                    await googleCalendarService.updateEvent(
                        meeting.company_id,
                        meeting.agent_id,
                        meeting.google_calendar_event_id,
                        {
                            title: updateData.title || meeting.title,
                            description: updateData.description !== undefined ? updateData.description : meeting.description,
                            startTime: updateData.startTime ? new Date(updateData.startTime) : new Date(meeting.start_time),
                            endTime: updateData.endTime ? new Date(updateData.endTime) : new Date(meeting.end_time)
                        }
                    );
                } catch (calendarError) {
                    console.error('Failed to update calendar event:', calendarError);
                }
            }

            return await this.getMeetingById(meetingId);
        } finally {
            conn.release();
        }
    }

    // Cancel meeting
    async cancelMeeting(meetingId, reason = '') {
        const conn = await pool.getConnection();
        try {
            await conn.query(`
                UPDATE meetings 
                SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP(3)
                WHERE id = ?
            `, [meetingId]);

            const meeting = await this.getMeetingById(meetingId);

            // Delete from Google Calendar
            if (meeting && meeting.google_calendar_event_id) {
                try {
                    await googleCalendarService.deleteEvent(
                        meeting.company_id,
                        meeting.agent_id,
                        meeting.google_calendar_event_id
                    );
                } catch (calendarError) {
                    console.error('Failed to delete calendar event:', calendarError);
                }
            }

            // Send WhatsApp cancellation notice
            if (meeting && meeting.customer_phone) {
                try {
                    const message = `📅 *Meeting Cancelled*

*Title:* ${meeting.title}
*Date:* ${new Date(meeting.start_time).toLocaleDateString()}
*Time:* ${new Date(meeting.start_time).toLocaleTimeString()}

${reason ? `*Reason:* ${reason}` : ''}

If you'd like to reschedule, please let us know!`;

                    await whatsappService.sendMessage(
                        meeting.company_id,
                        meeting.customer_phone,
                        message
                    );
                } catch (whatsappError) {
                    console.error('Failed to send WhatsApp cancellation:', whatsappError);
                }
            }

            // Emit to admin panel
            const { getSocket } = require('../services/helpers/socket.helper.service');
            const io = getSocket();
            io.to(`company-${meeting.company_id}`).emit('meeting-cancelled', {
                meetingId,
                meeting,
                reason
            });

            return meeting;
        } finally {
            conn.release();
        }
    }

    // Get meetings that need reminders
    async getMeetingsNeedingReminders() {
        const conn = await pool.getConnection();
        try {
            const now = new Date();
            
            // 24 hour reminders
            const [day24Rows] = await conn.query(`
                SELECT * FROM meetings 
                WHERE status = 'scheduled' 
                AND start_time BETWEEN DATE_ADD(?, INTERVAL 23 HOUR) AND DATE_ADD(?, INTERVAL 25 HOUR)
                AND reminder_sent_24h = FALSE
            `, [now, now]);

            // 1 hour reminders
            const [hour1Rows] = await conn.query(`
                SELECT * FROM meetings 
                WHERE status = 'scheduled' 
                AND start_time BETWEEN DATE_ADD(?, INTERVAL 50 MINUTE) AND DATE_ADD(?, INTERVAL 70 MINUTE)
                AND reminder_sent_1h = FALSE
            `, [now, now]);

            // 10 minute reminders
            const [min10Rows] = await conn.query(`
                SELECT * FROM meetings 
                WHERE status = 'scheduled' 
                AND start_time BETWEEN DATE_ADD(?, INTERVAL 5 MINUTE) AND DATE_ADD(?, INTERVAL 15 MINUTE)
                AND reminder_sent_10m = FALSE
            `, [now, now]);

            return {
                day24: day24Rows,
                hour1: hour1Rows,
                min10: min10Rows
            };
        } finally {
            conn.release();
        }
    }

    // Mark reminder as sent
    async markReminderSent(meetingId, reminderType) {
        const conn = await pool.getConnection();
        try {
            const field = `reminder_sent_${reminderType}`;
            await conn.query(`
                UPDATE meetings 
                SET ${field} = TRUE, updated_at = CURRENT_TIMESTAMP(3)
                WHERE id = ?
            `, [meetingId]);
        } finally {
            conn.release();
        }
    }

    // Process all pending reminders
    async processReminders() {
        const reminders = await this.getMeetingsNeedingReminders();
        
        // Process 24 hour reminders
        for (const meeting of reminders.day24) {
            try {
                if (meeting.customer_phone) {
                    await whatsappService.sendMeetingReminder(
                        meeting.company_id,
                        meeting.customer_phone,
                        meeting,
                        '24h'
                    );
                }
                await this.markReminderSent(meeting.id, '24h');
            } catch (error) {
                console.error(`Failed to send 24h reminder for meeting ${meeting.id}:`, error);
            }
        }

        // Process 1 hour reminders
        for (const meeting of reminders.hour1) {
            try {
                if (meeting.customer_phone) {
                    await whatsappService.sendMeetingReminder(
                        meeting.company_id,
                        meeting.customer_phone,
                        meeting,
                        '1h'
                    );
                }
                await this.markReminderSent(meeting.id, '1h');
            } catch (error) {
                console.error(`Failed to send 1h reminder for meeting ${meeting.id}:`, error);
            }
        }

        // Process 10 minute reminders
        for (const meeting of reminders.min10) {
            try {
                if (meeting.customer_phone) {
                    await whatsappService.sendMeetingReminder(
                        meeting.company_id,
                        meeting.customer_phone,
                        meeting,
                        '10m'
                    );
                }
                await this.markReminderSent(meeting.id, '10m');
            } catch (error) {
                console.error(`Failed to send 10m reminder for meeting ${meeting.id}:`, error);
            }
        }

        return {
            processed24h: reminders.day24.length,
            processed1h: reminders.hour1.length,
            processed10m: reminders.min10.length
        };
    }

    // Get meeting statistics
    async getMeetingStats(companyId, startDate, endDate) {
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(`
                SELECT 
                    COUNT(*) as total_meetings,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                    SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled,
                    DATE(start_time) as meeting_date
                FROM meetings 
                WHERE company_id = ? 
                AND start_time BETWEEN ? AND ?
                GROUP BY DATE(start_time)
                ORDER BY meeting_date DESC
            `, [companyId, startDate, endDate]);

            return rows;
        } finally {
            conn.release();
        }
    }
}

module.exports = new MeetingsService();
