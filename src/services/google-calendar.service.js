const { pool } = require('../config/db.config');
const { google } = require('googleapis');
const axios = require('axios');

class GoogleCalendarService {
    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
    }

    // Get authorization URL for Google Calendar
    getAuthUrl(companyId, agentId = null) {
        const scopes = [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events'
        ];

        const state = JSON.stringify({ companyId, agentId });
        
        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            state: state,
            prompt: 'consent'
        });
    }

    // Exchange authorization code for tokens
    async exchangeCodeForTokens(code) {
        try {
            const { tokens } = await this.oauth2Client.getAccessToken(code);
            return tokens;
        } catch (error) {
            console.error('Google auth token exchange error:', error);
            throw error;
        }
    }

    // Save Google Calendar configuration
    async saveCalendarConfig(companyId, agentId, tokens, calendarId = 'primary') {
        const conn = await pool.getConnection();
        try {
            const configId = require('uuid').v4();
            await conn.query(`
                INSERT INTO google_calendar_configs (
                    id, company_id, agent_id, access_token, 
                    refresh_token, calendar_id
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                access_token = VALUES(access_token),
                refresh_token = VALUES(refresh_token),
                calendar_id = VALUES(calendar_id),
                updated_at = CURRENT_TIMESTAMP(3)
            `, [
                configId, companyId, agentId, tokens.access_token,
                tokens.refresh_token, calendarId
            ]);
            return configId;
        } finally {
            conn.release();
        }
    }

    // Get calendar configuration
    async getCalendarConfig(companyId, agentId = null) {
        const conn = await pool.getConnection();
        try {
            let query = 'SELECT * FROM google_calendar_configs WHERE company_id = ? AND is_active = TRUE';
            const params = [companyId];

            if (agentId) {
                query += ' AND agent_id = ?';
                params.push(agentId);
            } else {
                query += ' AND agent_id IS NULL';
            }

            const [rows] = await conn.query(query, params);
            return rows[0] || null;
        } finally {
            conn.release();
        }
    }

    // Refresh access token
    async refreshAccessToken(refreshToken) {
        try {
            this.oauth2Client.setCredentials({ refresh_token });
            const { credentials } = await this.oauth2Client.refreshAccessToken();
            return credentials.access_token;
        } catch (error) {
            console.error('Google token refresh error:', error);
            throw error;
        }
    }

    // Get authenticated calendar client
    async getCalendarClient(companyId, agentId = null) {
        const config = await this.getCalendarConfig(companyId, agentId);
        
        if (!config) {
            throw new Error('Google Calendar not configured');
        }

        // Check if access token needs refresh
        let accessToken = config.access_token;
        
        try {
            // Test the current token
            const testClient = google.calendar({ version: 'v3', auth: this.oauth2Client });
            this.oauth2Client.setCredentials({ access_token: accessToken });
            await testClient.calendarList.list({ maxResults: 1 });
        } catch (error) {
            // Token expired, refresh it
            accessToken = await this.refreshAccessToken(config.refresh_token);
            
            // Update in database
            const conn = await pool.getConnection();
            try {
                await conn.query(
                    'UPDATE google_calendar_configs SET access_token = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
                    [accessToken, config.id]
                );
            } finally {
                conn.release();
            }
        }

        this.oauth2Client.setCredentials({ access_token: accessToken });
        return google.calendar({ version: 'v3', auth: this.oauth2Client });
    }

    // Get available time slots
    async getAvailableTimeSlots(companyId, agentId, date, duration = 30) {
        try {
            const calendar = await this.getCalendarClient(companyId, agentId);
            const startOfDay = new Date(date);
            startOfDay.setHours(9, 0, 0, 0); // 9 AM start
            
            const endOfDay = new Date(date);
            endOfDay.setHours(17, 0, 0, 0); // 5 PM end

            // Check for existing events
            const response = await calendar.events.list({
                calendarId: 'primary',
                timeMin: startOfDay.toISOString(),
                timeMax: endOfDay.toISOString(),
                singleEvents: true,
                orderBy: 'startTime'
            });

            const events = response.data.items || [];
            const busySlots = events.map(event => ({
                start: new Date(event.start.dateTime || event.start.date),
                end: new Date(event.end.dateTime || event.end.date)
            }));

            // Generate available slots
            const availableSlots = [];
            let currentTime = new Date(startOfDay);

            while (currentTime < endOfDay) {
                const slotEnd = new Date(currentTime.getTime() + duration * 60000);
                
                // Check if slot conflicts with any busy time
                const isAvailable = !busySlots.some(busy => 
                    (currentTime >= busy.start && currentTime < busy.end) ||
                    (slotEnd > busy.start && slotEnd <= busy.end) ||
                    (currentTime <= busy.start && slotEnd >= busy.end)
                );

                if (isAvailable && slotEnd <= endOfDay) {
                    availableSlots.push({
                        start: new Date(currentTime),
                        end: slotEnd,
                        display: currentTime.toLocaleTimeString('en-US', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                        })
                    });
                }

                currentTime = new Date(currentTime.getTime() + 30 * 60000); // 30-minute intervals
            }

            return availableSlots;
        } catch (error) {
            console.error('Get available time slots error:', error);
            throw error;
        }
    }

    // Create calendar event
    async createEvent(companyId, agentId, eventData) {
        try {
            const calendar = await this.getCalendarClient(companyId, agentId);
            
            const event = {
                summary: eventData.title,
                description: eventData.description || '',
                start: {
                    dateTime: eventData.startTime.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                },
                end: {
                    dateTime: eventData.endTime.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                },
                attendees: eventData.attendees || [],
                conferenceData: eventData.createMeet ? {
                    createRequest: {
                        requestId: require('uuid').v4(),
                        conferenceSolutionKey: { type: 'hangoutsMeet' }
                    }
                } : undefined,
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 }, // 24 hours before
                        { method: 'popup', minutes: 60 }, // 1 hour before
                        { method: 'popup', minutes: 10 } // 10 minutes before
                    ]
                }
            };

            const response = await calendar.events.insert({
                calendarId: 'primary',
                resource: event,
                conferenceDataVersion: 1
            });

            return response.data;
        } catch (error) {
            console.error('Create calendar event error:', error);
            throw error;
        }
    }

    // Update calendar event
    async updateEvent(companyId, agentId, eventId, eventData) {
        try {
            const calendar = await this.getCalendarClient(companyId, agentId);
            
            const event = {
                summary: eventData.title,
                description: eventData.description || '',
                start: {
                    dateTime: eventData.startTime.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                },
                end: {
                    dateTime: eventData.endTime.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                }
            };

            const response = await calendar.events.update({
                calendarId: 'primary',
                eventId: eventId,
                resource: event
            });

            return response.data;
        } catch (error) {
            console.error('Update calendar event error:', error);
            throw error;
        }
    }

    // Delete calendar event
    async deleteEvent(companyId, agentId, eventId) {
        try {
            const calendar = await this.getCalendarClient(companyId, agentId);
            await calendar.events.delete({
                calendarId: 'primary',
                eventId: eventId
            });
            return true;
        } catch (error) {
            console.error('Delete calendar event error:', error);
            throw error;
        }
    }

    // Get upcoming events
    async getUpcomingEvents(companyId, agentId, days = 7) {
        try {
            const calendar = await this.getCalendarClient(companyId, agentId);
            const now = new Date();
            const endTime = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

            const response = await calendar.events.list({
                calendarId: 'primary',
                timeMin: now.toISOString(),
                timeMax: endTime.toISOString(),
                singleEvents: true,
                orderBy: 'startTime'
            });

            return response.data.items || [];
        } catch (error) {
            console.error('Get upcoming events error:', error);
            throw error;
        }
    }

    // Handle OAuth callback
    async handleCallback(code, state) {
        try {
            const { companyId, agentId } = JSON.parse(state);
            const tokens = await this.exchangeCodeForTokens(code);
            
            const configId = await this.saveCalendarConfig(
                companyId, 
                agentId, 
                tokens
            );

            return { success: true, configId };
        } catch (error) {
            console.error('Google OAuth callback error:', error);
            throw error;
        }
    }

    // Disconnect calendar
    async disconnectCalendar(companyId, agentId = null) {
        const conn = await pool.getConnection();
        try {
            await conn.query(
                'UPDATE google_calendar_configs SET is_active = FALSE WHERE company_id = ? AND agent_id ' + 
                (agentId ? '= ?' : 'IS NULL'),
                agentId ? [companyId, agentId] : [companyId]
            );
            return true;
        } finally {
            conn.release();
        }
    }
}

module.exports = new GoogleCalendarService();
