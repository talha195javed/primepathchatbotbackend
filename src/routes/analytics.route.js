const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analytics.service');
const { authenticateToken } = require('../middleware/auth.middleware');

// Get dashboard overview
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const { dateRange = '30d' } = req.query;
        const companyId = req.user.company_id || req.user.id;
        
        const overview = await analyticsService.getDashboardOverview(companyId, dateRange);
        res.json({ overview });
    } catch (error) {
        console.error('Get dashboard overview error:', error);
        res.status(500).json({ error: 'Failed to get dashboard overview' });
    }
});

// Get conversation analytics
router.get('/conversations', authenticateToken, async (req, res) => {
    try {
        const { dateRange = '30d' } = req.query;
        const companyId = req.user.company_id || req.user.id;
        
        const analytics = await analyticsService.getConversationAnalytics(companyId, dateRange);
        res.json({ analytics });
    } catch (error) {
        console.error('Get conversation analytics error:', error);
        res.status(500).json({ error: 'Failed to get conversation analytics' });
    }
});

// Get lead analytics
router.get('/leads', authenticateToken, async (req, res) => {
    try {
        const { dateRange = '30d' } = req.query;
        const companyId = req.user.company_id || req.user.id;
        
        const analytics = await analyticsService.getLeadAnalytics(companyId, dateRange);
        res.json({ analytics });
    } catch (error) {
        console.error('Get lead analytics error:', error);
        res.status(500).json({ error: 'Failed to get lead analytics' });
    }
});

// Get meeting analytics
router.get('/meetings', authenticateToken, async (req, res) => {
    try {
        const { dateRange = '30d' } = req.query;
        const companyId = req.user.company_id || req.user.id;
        
        const analytics = await analyticsService.getMeetingAnalytics(companyId, dateRange);
        res.json({ analytics });
    } catch (error) {
        console.error('Get meeting analytics error:', error);
        res.status(500).json({ error: 'Failed to get meeting analytics' });
    }
});

// Get revenue analytics
router.get('/revenue', authenticateToken, async (req, res) => {
    try {
        const { dateRange = '30d' } = req.query;
        const companyId = req.user.company_id || req.user.id;
        
        const analytics = await analyticsService.getRevenueAnalytics(companyId, dateRange);
        res.json({ analytics });
    } catch (error) {
        console.error('Get revenue analytics error:', error);
        res.status(500).json({ error: 'Failed to get revenue analytics' });
    }
});

// Get real-time stats
router.get('/realtime', authenticateToken, async (req, res) => {
    try {
        const companyId = req.user.company_id || req.user.id;
        
        const stats = await analyticsService.getRealTimeStats(companyId);
        res.json({ stats });
    } catch (error) {
        console.error('Get real-time stats error:', error);
        res.status(500).json({ error: 'Failed to get real-time stats' });
    }
});

// Export analytics data
router.get('/export', authenticateToken, async (req, res) => {
    try {
        const { dateRange = '30d', format = 'json' } = req.query;
        const companyId = req.user.company_id || req.user.id;
        
        const data = await analyticsService.exportAnalytics(companyId, dateRange, format);
        
        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="analytics-${dateRange}.csv"`);
            res.send(data);
        } else {
            res.json({ data });
        }
    } catch (error) {
        console.error('Export analytics error:', error);
        res.status(500).json({ error: 'Failed to export analytics' });
    }
});

// Get date range options
router.get('/date-ranges', (req, res) => {
    try {
        const ranges = [
            { value: '7d', label: 'Last 7 days' },
            { value: '30d', label: 'Last 30 days' },
            { value: '90d', label: 'Last 90 days' },
            { value: '1y', label: 'Last year' }
        ];
        
        res.json({ ranges });
    } catch (error) {
        console.error('Get date ranges error:', error);
        res.status(500).json({ error: 'Failed to get date ranges' });
    }
});

module.exports = router;
