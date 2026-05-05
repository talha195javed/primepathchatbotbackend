const express = require('express');
const router = express.Router();
const meetingsService = require('../services/meetings.service');
const { authenticateToken } = require('../middleware/auth.middleware');

// Create new meeting
router.post('/', authenticateToken, async (req, res) => {
    try {
        const {
            title,
            description,
            startTime,
            endTime,
            customerId,
            agentId,
            threadId,
            attendees = []
        } = req.body;

        if (!title || !startTime || !endTime || !customerId || !agentId) {
            return res.status(400).json({ 
                error: 'Missing required fields: title, startTime, endTime, customerId, agentId' 
            });
        }

        const companyId = req.user.company_id || req.user.id;
        
        const meetingId = await meetingsService.createMeeting({
            companyId,
            customerId,
            agentId,
            threadId,
            title,
            description,
            startTime,
            endTime,
            attendees
        });

        const meeting = await meetingsService.getMeetingById(meetingId);
        res.json({ success: true, meeting });
    } catch (error) {
        console.error('Create meeting error:', error);
        res.status(500).json({ error: 'Failed to create meeting' });
    }
});

// Get meeting by ID
router.get('/:meetingId', authenticateToken, async (req, res) => {
    try {
        const { meetingId } = req.params;
        const companyId = req.user.company_id || req.user.id;
        
        const meeting = await meetingsService.getMeetingById(meetingId);
        
        if (!meeting || meeting.company_id !== companyId) {
            return res.status(404).json({ error: 'Meeting not found' });
        }

        res.json({ meeting });
    } catch (error) {
        console.error('Get meeting error:', error);
        res.status(500).json({ error: 'Failed to get meeting' });
    }
});

// Get company meetings
router.get('/', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.company_id || req.user.id;
        const filters = {
            status: req.query.status,
            agentId: req.query.agentId,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            limit: req.query.limit ? parseInt(req.query.limit) : undefined
        };
        
        const meetings = await meetingsService.getCompanyMeetings(companyId, filters);
        res.json({ meetings });
    } catch (error) {
        console.error('Get meetings error:', error);
        res.status(500).json({ error: 'Failed to get meetings' });
    }
});

// Update meeting
router.put('/:meetingId', authenticateToken, async (req, res) => {
    try {
        const { meetingId } = req.params;
        const companyId = req.user.company_id || req.user.id;
        
        // Check if meeting belongs to company
        const existingMeeting = await meetingsService.getMeetingById(meetingId);
        if (!existingMeeting || existingMeeting.company_id !== companyId) {
            return res.status(404).json({ error: 'Meeting not found' });
        }

        const updateData = {
            title: req.body.title,
            description: req.body.description,
            startTime: req.body.startTime,
            endTime: req.body.endTime,
            status: req.body.status
        };

        const meeting = await meetingsService.updateMeeting(meetingId, updateData);
        res.json({ success: true, meeting });
    } catch (error) {
        console.error('Update meeting error:', error);
        res.status(500).json({ error: 'Failed to update meeting' });
    }
});

// Cancel meeting
router.post('/:meetingId/cancel', authenticateToken, async (req, res) => {
    try {
        const { meetingId } = req.params;
        const { reason } = req.body;
        const companyId = req.user.company_id || req.user.id;
        
        // Check if meeting belongs to company
        const existingMeeting = await meetingsService.getMeetingById(meetingId);
        if (!existingMeeting || existingMeeting.company_id !== companyId) {
            return res.status(404).json({ error: 'Meeting not found' });
        }

        const meeting = await meetingsService.cancelMeeting(meetingId, reason);
        res.json({ success: true, meeting });
    } catch (error) {
        console.error('Cancel meeting error:', error);
        res.status(500).json({ error: 'Failed to cancel meeting' });
    }
});

// Get meeting statistics
router.get('/stats/overview', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.company_id || req.user.id;
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        const stats = await meetingsService.getMeetingStats(companyId, startDate, endDate);
        res.json({ stats });
    } catch (error) {
        console.error('Get meeting stats error:', error);
        res.status(500).json({ error: 'Failed to get meeting statistics' });
    }
});

// Process reminders (system endpoint)
router.post('/process-reminders', async (req, res) => {
    try {
        // This should be protected by API key in production
        const result = await meetingsService.processReminders();
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Process reminders error:', error);
        res.status(500).json({ error: 'Failed to process reminders' });
    }
});

// Reschedule meeting
router.post('/:meetingId/reschedule', authenticateToken, async (req, res) => {
    try {
        const { meetingId } = req.params;
        const { startTime, endTime, reason } = req.body;
        const companyId = req.user.company_id || req.user.id;
        
        if (!startTime || !endTime) {
            return res.status(400).json({ error: 'startTime and endTime are required' });
        }

        // Check if meeting belongs to company
        const existingMeeting = await meetingsService.getMeetingById(meetingId);
        if (!existingMeeting || existingMeeting.company_id !== companyId) {
            return res.status(404).json({ error: 'Meeting not found' });
        }

        // Update meeting with new times
        const meeting = await meetingsService.updateMeeting(meetingId, {
            startTime,
            endTime,
            status: 'scheduled'
        });

        // Send reschedule notification via WhatsApp
        if (existingMeeting.customer_phone) {
            const whatsappService = require('../services/whatsapp.service');
            try {
                const message = `📅 *Meeting Rescheduled*

*Title:* ${existingMeeting.title}
*Old Time:* ${new Date(existingMeeting.start_time).toLocaleString()}
*New Time:* ${new Date(startTime).toLocaleString()}

${reason ? `*Reason:* ${reason}` : ''}

We'll send you a reminder before the meeting. Looking forward to speaking with you!`;

                await whatsappService.sendMessage(
                    companyId,
                    existingMeeting.customer_phone,
                    message
                );
            } catch (whatsappError) {
                console.error('Failed to send reschedule notification:', whatsappError);
            }
        }

        res.json({ success: true, meeting });
    } catch (error) {
        console.error('Reschedule meeting error:', error);
        res.status(500).json({ error: 'Failed to reschedule meeting' });
    }
});

module.exports = router;
