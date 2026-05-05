const express = require('express');
const router = express.Router();
const googleCalendarService = require('../services/google-calendar.service');
const { authenticateToken } = require('../middleware/auth.middleware');

// Get authorization URL
router.get('/auth-url', authenticateToken, (req, res) => {
    try {
        const companyId = req.user.company_id || req.user.id;
        const agentId = req.query.agentId || null;
        
        const authUrl = googleCalendarService.getAuthUrl(companyId, agentId);
        res.json({ authUrl });
    } catch (error) {
        console.error('Get auth URL error:', error);
        res.status(500).json({ error: 'Failed to generate authorization URL' });
    }
});

// Handle OAuth callback
router.post('/callback', async (req, res) => {
    try {
        const { code, state } = req.body;
        
        if (!code || !state) {
            return res.status(400).json({ error: 'Missing code or state' });
        }

        const result = await googleCalendarService.handleCallback(code, state);
        res.json(result);
    } catch (error) {
        console.error('Google OAuth callback error:', error);
        res.status(500).json({ error: 'Failed to complete authorization' });
    }
});

// Get available time slots
router.get('/available-slots', authenticateToken, async (req, res) => {
    try {
        const { date, duration = 30, agentId } = req.query;
        
        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        const companyId = req.user.company_id || req.user.id;
        
        const slots = await googleCalendarService.getAvailableTimeSlots(
            companyId,
            agentId,
            date,
            parseInt(duration)
        );

        res.json({ slots });
    } catch (error) {
        console.error('Get available slots error:', error);
        res.status(500).json({ error: 'Failed to get available time slots' });
    }
});

// Create calendar event
router.post('/events', authenticateToken, async (req, res) => {
    try {
        const {
            title,
            description,
            startTime,
            endTime,
            attendees = [],
            createMeet = true,
            agentId
        } = req.body;

        if (!title || !startTime || !endTime) {
            return res.status(400).json({ 
                error: 'Missing required fields: title, startTime, endTime' 
            });
        }

        const companyId = req.user.company_id || req.user.id;
        
        const event = await googleCalendarService.createEvent(companyId, agentId, {
            title,
            description,
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            attendees: attendees.map(email => ({ email })),
            createMeet
        });

        res.json({ success: true, event });
    } catch (error) {
        console.error('Create calendar event error:', error);
        res.status(500).json({ error: 'Failed to create calendar event' });
    }
});

// Update calendar event
router.put('/events/:eventId', authenticateToken, async (req, res) => {
    try {
        const { eventId } = req.params;
        const { title, description, startTime, endTime, agentId } = req.body;

        if (!title || !startTime || !endTime) {
            return res.status(400).json({ 
                error: 'Missing required fields: title, startTime, endTime' 
            });
        }

        const companyId = req.user.company_id || req.user.id;
        
        const event = await googleCalendarService.updateEvent(companyId, agentId, eventId, {
            title,
            description,
            startTime: new Date(startTime),
            endTime: new Date(endTime)
        });

        res.json({ success: true, event });
    } catch (error) {
        console.error('Update calendar event error:', error);
        res.status(500).json({ error: 'Failed to update calendar event' });
    }
});

// Delete calendar event
router.delete('/events/:eventId', authenticateToken, async (req, res) => {
    try {
        const { eventId } = req.params;
        const { agentId } = req.query;

        const companyId = req.user.company_id || req.user.id;
        
        await googleCalendarService.deleteEvent(companyId, agentId, eventId);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete calendar event error:', error);
        res.status(500).json({ error: 'Failed to delete calendar event' });
    }
});

// Get upcoming events
router.get('/events', authenticateToken, async (req, res) => {
    try {
        const { days = 7, agentId } = req.query;

        const companyId = req.user.company_id || req.user.id;
        
        const events = await googleCalendarService.getUpcomingEvents(
            companyId,
            agentId,
            parseInt(days)
        );

        res.json({ events });
    } catch (error) {
        console.error('Get upcoming events error:', error);
        res.status(500).json({ error: 'Failed to get upcoming events' });
    }
});

// Get calendar configuration
router.get('/config', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.company_id || req.user.id;
        const agentId = req.query.agentId || null;
        
        const config = await googleCalendarService.getCalendarConfig(companyId, agentId);
        
        if (!config) {
            return res.status(404).json({ error: 'Google Calendar not configured' });
        }

        // Don't send sensitive tokens to client
        const { access_token, refresh_token, ...safeConfig } = config;
        res.json(safeConfig);
    } catch (error) {
        console.error('Get calendar config error:', error);
        res.status(500).json({ error: 'Failed to get calendar configuration' });
    }
});

// Disconnect calendar
router.post('/disconnect', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.company_id || req.user.id;
        const agentId = req.body.agentId || null;
        
        await googleCalendarService.disconnectCalendar(companyId, agentId);
        res.json({ success: true });
    } catch (error) {
        console.error('Disconnect calendar error:', error);
        res.status(500).json({ error: 'Failed to disconnect calendar' });
    }
});

module.exports = router;
