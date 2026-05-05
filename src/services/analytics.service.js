const { pool } = require('../config/db.config');

class AnalyticsService {
    // Get dashboard overview
    async getDashboardOverview(companyId, dateRange = '30d') {
        const conn = await pool.getConnection();
        try {
            const { startDate, endDate } = this.getDateRange(dateRange);

            // Get key metrics
            const [metrics] = await conn.query(`
                SELECT 
                    COUNT(DISTINCT c.id) as total_customers,
                    COUNT(DISTINCT ct.id) as total_conversations,
                    COUNT(DISTINCT cm.id) as total_messages,
                    COUNT(DISTINCT m.id) as total_meetings,
                    COUNT(DISTINCT CASE WHEN m.status = 'completed' THEN m.id END) as completed_meetings,
                    COUNT(DISTINCT l.id) as total_leads,
                    COUNT(DISTINCT CASE WHEN l.status = 'converted' THEN l.id END) as converted_leads
                FROM companies comp
                LEFT JOIN customers c ON comp.id = c.company_id
                LEFT JOIN chat_threads ct ON c.id = ct.customer_id AND ct.created_at BETWEEN ? AND ?
                LEFT JOIN chat_messages cm ON ct.id = cm.thread_id AND cm.created_at BETWEEN ? AND ?
                LEFT JOIN meetings m ON comp.id = m.company_id AND m.start_time BETWEEN ? AND ?
                LEFT JOIN leads l ON comp.id = l.company_id AND l.created_at BETWEEN ? AND ?
                WHERE comp.id = ?
            `, [startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, companyId]);

            // Get conversation trend
            const [conversationTrend] = await conn.query(`
                SELECT 
                    DATE(ct.created_at) as date,
                    COUNT(DISTINCT ct.id) as conversations,
                    COUNT(DISTINCT c.id) as new_customers
                FROM chat_threads ct
                JOIN customers c ON ct.customer_id = c.id
                WHERE ct.company_id = ? 
                AND ct.created_at BETWEEN ? AND ?
                GROUP BY DATE(ct.created_at)
                ORDER BY date DESC
                LIMIT 30
            `, [companyId, startDate, endDate]);

            // Get message volume by channel
            const [channelStats] = await conn.query(`
                SELECT 
                    ct.channel,
                    COUNT(cm.id) as message_count,
                    COUNT(DISTINCT ct.id) as conversation_count
                FROM chat_threads ct
                LEFT JOIN chat_messages cm ON ct.id = cm.thread_id
                WHERE ct.company_id = ? 
                AND ct.created_at BETWEEN ? AND ?
                GROUP BY ct.channel
            `, [companyId, startDate, endDate]);

            // Get lead conversion funnel
            const [funnelData] = await conn.query(`
                SELECT 
                    l.status,
                    COUNT(*) as count,
                    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM leads WHERE company_id = ? AND created_at BETWEEN ? AND ?), 2) as percentage
                FROM leads l
                WHERE l.company_id = ? 
                AND l.created_at BETWEEN ? AND ?
                GROUP BY l.status
                ORDER BY 
                    CASE l.status 
                        WHEN 'new' THEN 1
                        WHEN 'contacted' THEN 2
                        WHEN 'qualified' THEN 3
                        WHEN 'converted' THEN 4
                        WHEN 'lost' THEN 5
                    END
            `, [companyId, startDate, endDate, companyId, startDate, endDate]);

            // Get top performing agents
            const [agentPerformance] = await conn.query(`
                SELECT 
                    a.id,
                    a.name,
                    COUNT(DISTINCT ct.id) as conversations,
                    COUNT(DISTINCT CASE WHEN l.status = 'converted' THEN l.id END) as converted_leads,
                    AVG(l.score) as avg_lead_score,
                    COUNT(cm.id) as messages_handled
                FROM agents a
                LEFT JOIN chat_threads ct ON a.id = ct.agent_id AND ct.created_at BETWEEN ? AND ?
                LEFT JOIN leads l ON a.id = l.assigned_agent_id AND l.created_at BETWEEN ? AND ?
                LEFT JOIN chat_messages cm ON ct.id = cm.thread_id AND cm.created_at BETWEEN ? AND ?
                WHERE a.company_id = ?
                GROUP BY a.id, a.name
                ORDER BY converted_leads DESC, conversations DESC
                LIMIT 10
            `, [startDate, endDate, startDate, endDate, startDate, endDate, companyId]);

            return {
                metrics: metrics[0],
                conversationTrend,
                channelStats,
                funnelData,
                agentPerformance
            };
        } finally {
            conn.release();
        }
    }

    // Get conversation analytics
    async getConversationAnalytics(companyId, dateRange = '30d') {
        const conn = await pool.getConnection();
        try {
            const { startDate, endDate } = this.getDateRange(dateRange);

            // Conversation metrics
            const [conversationMetrics] = await conn.query(`
                SELECT 
                    COUNT(DISTINCT ct.id) as total_conversations,
                    COUNT(DISTINCT c.id) as unique_customers,
                    AVG(ct_messages.message_count) as avg_messages_per_conversation,
                    MIN(ct_messages.first_message_time) as first_conversation,
                    MAX(ct_messages.last_message_time) as last_conversation,
                    SUM(CASE WHEN ct.channel = 'web' THEN 1 ELSE 0 END) as web_conversations,
                    SUM(CASE WHEN ct.channel = 'whatsapp' THEN 1 ELSE 0 END) as whatsapp_conversations
                FROM (
                    SELECT 
                        ct.id,
                        ct.customer_id,
                        ct.channel,
                        COUNT(cm.id) as message_count,
                        MIN(cm.created_at) as first_message_time,
                        MAX(cm.created_at) as last_message_time
                    FROM chat_threads ct
                    LEFT JOIN chat_messages cm ON ct.id = cm.thread_id
                    WHERE ct.company_id = ? 
                    AND ct.created_at BETWEEN ? AND ?
                    GROUP BY ct.id, ct.customer_id, ct.channel
                ) ct_messages
                JOIN chat_threads ct ON ct_messages.id = ct.id
                JOIN customers c ON ct.customer_id = c.id
            `, [companyId, startDate, endDate]);

            // Response time analytics
            const [responseTimes] = await conn.query(`
                SELECT 
                    AVG(response_time) as avg_response_time_seconds,
                    MIN(response_time) as min_response_time_seconds,
                    MAX(response_time) as max_response_time_seconds,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time) as median_response_time_seconds,
                    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time) as p95_response_time_seconds
                FROM (
                    SELECT 
                        TIMESTAMPDIFF(SECOND, 
                            prev_msg.created_at, 
                            curr_msg.created_at
                        ) as response_time
                    FROM chat_messages curr_msg
                    JOIN chat_messages prev_msg ON curr_msg.thread_id = prev_msg.thread_id
                        AND curr_msg.created_at > prev_msg.created_at
                        AND prev_msg.role = 'customer'
                        AND curr_msg.role = 'team'
                    JOIN chat_threads ct ON curr_msg.thread_id = ct.id
                    WHERE ct.company_id = ? 
                    AND curr_msg.created_at BETWEEN ? AND ?
                    AND prev_msg.created_at BETWEEN ? AND ?
                ) response_data
            `, [companyId, startDate, endDate, startDate, endDate]);

            // Conversation duration analytics
            const [durations] = await conn.query(`
                SELECT 
                    AVG(duration_minutes) as avg_duration_minutes,
                    MIN(duration_minutes) as min_duration_minutes,
                    MAX(duration_minutes) as max_duration_minutes,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_minutes) as median_duration_minutes
                FROM (
                    SELECT 
                        TIMESTAMPDIFF(MINUTE, 
                            MIN(cm.created_at), 
                            MAX(cm.created_at)
                        ) as duration_minutes
                    FROM chat_threads ct
                    JOIN chat_messages cm ON ct.id = cm.thread_id
                    WHERE ct.company_id = ? 
                    AND ct.created_at BETWEEN ? AND ?
                    AND ct.is_active = FALSE
                    GROUP BY ct.id
                ) duration_data
            `, [companyId, startDate, endDate]);

            return {
                conversationMetrics: conversationMetrics[0],
                responseTimes: responseTimes[0],
                durations: durations[0]
            };
        } finally {
            conn.release();
        }
    }

    // Get lead analytics
    async getLeadAnalytics(companyId, dateRange = '30d') {
        const conn = await pool.getConnection();
        try {
            const { startDate, endDate } = this.getDateRange(dateRange);

            // Lead metrics
            const [leadMetrics] = await conn.query(`
                SELECT 
                    COUNT(*) as total_leads,
                    COUNT(CASE WHEN l.status = 'new' THEN 1 END) as new_leads,
                    COUNT(CASE WHEN l.status = 'contacted' THEN 1 END) as contacted_leads,
                    COUNT(CASE WHEN l.status = 'qualified' THEN 1 END) as qualified_leads,
                    COUNT(CASE WHEN l.status = 'converted' THEN 1 END) as converted_leads,
                    COUNT(CASE WHEN l.status = 'lost' THEN 1 END) as lost_leads,
                    AVG(l.score) as avg_lead_score,
                    MAX(l.score) as max_lead_score,
                    ROUND(COUNT(CASE WHEN l.status = 'converted' THEN 1 END) * 100.0 / COUNT(*), 2) as conversion_rate
                FROM leads l
                WHERE l.company_id = ? 
                AND l.created_at BETWEEN ? AND ?
            `, [companyId, startDate, endDate]);

            // Lead source breakdown
            const [sourceBreakdown] = await conn.query(`
                SELECT 
                    l.source,
                    COUNT(*) as count,
                    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM leads WHERE company_id = ? AND created_at BETWEEN ? AND ?), 2) as percentage
                FROM leads l
                WHERE l.company_id = ? 
                AND l.created_at BETWEEN ? AND ?
                GROUP BY l.source
                ORDER BY count DESC
            `, [companyId, startDate, endDate, companyId, startDate, endDate]);

            // Lead score distribution
            const [scoreDistribution] = await conn.query(`
                SELECT 
                    CASE 
                        WHEN l.score >= 80 THEN 'Hot (80-100)'
                        WHEN l.score >= 60 THEN 'Warm (60-79)'
                        WHEN l.score >= 40 THEN 'Cool (40-59)'
                        ELSE 'Cold (0-39)'
                    END as score_range,
                    COUNT(*) as count,
                    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM leads WHERE company_id = ? AND created_at BETWEEN ? AND ?), 2) as percentage
                FROM leads l
                WHERE l.company_id = ? 
                AND l.created_at BETWEEN ? AND ?
                GROUP BY 
                    CASE 
                        WHEN l.score >= 80 THEN 'Hot (80-100)'
                        WHEN l.score >= 60 THEN 'Warm (60-79)'
                        WHEN l.score >= 40 THEN 'Cool (40-59)'
                        ELSE 'Cold (0-39)'
                    END
                ORDER BY 
                    CASE 
                        WHEN l.score >= 80 THEN 1
                        WHEN l.score >= 60 THEN 2
                        WHEN l.score >= 40 THEN 3
                        ELSE 4
                    END
            `, [companyId, startDate, endDate, companyId, startDate, endDate]);

            // Lead conversion timeline
            const [conversionTimeline] = await conn.query(`
                SELECT 
                    DATE(l.created_at) as date,
                    COUNT(*) as leads_created,
                    COUNT(CASE WHEN l.status = 'converted' THEN 1 END) as leads_converted,
                    ROUND(COUNT(CASE WHEN l.status = 'converted' THEN 1 END) * 100.0 / COUNT(*), 2) as daily_conversion_rate
                FROM leads l
                WHERE l.company_id = ? 
                AND l.created_at BETWEEN ? AND ?
                GROUP BY DATE(l.created_at)
                ORDER BY date DESC
                LIMIT 30
            `, [companyId, startDate, endDate]);

            return {
                leadMetrics: leadMetrics[0],
                sourceBreakdown,
                scoreDistribution,
                conversionTimeline
            };
        } finally {
            conn.release();
        }
    }

    // Get meeting analytics
    async getMeetingAnalytics(companyId, dateRange = '30d') {
        const conn = await pool.getConnection();
        try {
            const { startDate, endDate } = this.getDateRange(dateRange);

            // Meeting metrics
            const [meetingMetrics] = await conn.query(`
                SELECT 
                    COUNT(*) as total_meetings,
                    COUNT(CASE WHEN m.status = 'completed' THEN 1 END) as completed_meetings,
                    COUNT(CASE WHEN m.status = 'cancelled' THEN 1 END) as cancelled_meetings,
                    COUNT(CASE WHEN m.status = 'scheduled' THEN 1 END) as scheduled_meetings,
                    ROUND(COUNT(CASE WHEN m.status = 'completed' THEN 1 END) * 100.0 / COUNT(*), 2) as completion_rate,
                    AVG(TIMESTAMPDIFF(MINUTE, m.start_time, m.end_time)) as avg_duration_minutes
                FROM meetings m
                WHERE m.company_id = ? 
                AND m.start_time BETWEEN ? AND ?
            `, [companyId, startDate, endDate]);

            // Meetings by day of week
            const [dayOfWeekStats] = await conn.query(`
                SELECT 
                    DAYNAME(m.start_time) as day_of_week,
                    COUNT(*) as meeting_count,
                    COUNT(CASE WHEN m.status = 'completed' THEN 1 END) as completed_count
                FROM meetings m
                WHERE m.company_id = ? 
                AND m.start_time BETWEEN ? AND ?
                GROUP BY DAYNAME(m.start_time)
                ORDER BY 
                    CASE DAYNAME(m.start_time)
                        WHEN 'Monday' THEN 1
                        WHEN 'Tuesday' THEN 2
                        WHEN 'Wednesday' THEN 3
                        WHEN 'Thursday' THEN 4
                        WHEN 'Friday' THEN 5
                        WHEN 'Saturday' THEN 6
                        WHEN 'Sunday' THEN 7
                    END
            `, [companyId, startDate, endDate]);

            // Meeting time distribution
            const [timeDistribution] = await conn.query(`
                SELECT 
                    CASE 
                        WHEN HOUR(m.start_time) BETWEEN 6 AND 11 THEN 'Morning (6AM-12PM)'
                        WHEN HOUR(m.start_time) BETWEEN 12 AND 17 THEN 'Afternoon (12PM-6PM)'
                        WHEN HOUR(m.start_time) BETWEEN 18 AND 21 THEN 'Evening (6PM-10PM)'
                        ELSE 'Night (10PM-6AM)'
                    END as time_slot,
                    COUNT(*) as meeting_count,
                    COUNT(CASE WHEN m.status = 'completed' THEN 1 END) as completed_count
                FROM meetings m
                WHERE m.company_id = ? 
                AND m.start_time BETWEEN ? AND ?
                GROUP BY 
                    CASE 
                        WHEN HOUR(m.start_time) BETWEEN 6 AND 11 THEN 'Morning (6AM-12PM)'
                        WHEN HOUR(m.start_time) BETWEEN 12 AND 17 THEN 'Afternoon (12PM-6PM)'
                        WHEN HOUR(m.start_time) BETWEEN 18 AND 21 THEN 'Evening (6PM-10PM)'
                        ELSE 'Night (10PM-6AM)'
                    END
                ORDER BY meeting_count DESC
            `, [companyId, startDate, endDate]);

            return {
                meetingMetrics: meetingMetrics[0],
                dayOfWeekStats,
                timeDistribution
            };
        } finally {
            conn.release();
        }
    }

    // Get revenue analytics
    async getRevenueAnalytics(companyId, dateRange = '30d') {
        const conn = await pool.getConnection();
        try {
            const { startDate, endDate } = this.getDateRange(dateRange);

            // Get subscription info
            const [subscriptionInfo] = await conn.query(`
                SELECT s.plan, s.status, s.current_period_start, s.current_period_end
                FROM subscriptions s
                WHERE s.company_id = ?
                ORDER BY s.created_at DESC
                LIMIT 1
            `, [companyId]);

            // Calculate MRR based on plan
            const planPrices = {
                starter: 29,
                pro: 99,
                enterprise: 299
            };

            const currentMRR = subscriptionInfo[0] ? planPrices[subscriptionInfo[0].plan] || 0 : 0;

            // Lead value calculation
            const [leadValue] = await conn.query(`
                SELECT 
                    COUNT(*) as total_leads,
                    COUNT(CASE WHEN l.status = 'converted' THEN 1 END) as converted_leads,
                    AVG(l.score) as avg_lead_score,
                    ROUND(COUNT(CASE WHEN l.status = 'converted' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 2) as conversion_rate
                FROM leads l
                WHERE l.company_id = ? 
                AND l.created_at BETWEEN ? AND ?
            `, [companyId, startDate, endDate]);

            // Meeting value (assuming each converted lead results in a meeting)
            const [meetingValue] = await conn.query(`
                SELECT 
                    COUNT(*) as total_meetings,
                    COUNT(CASE WHEN m.status = 'completed' THEN 1 END) as completed_meetings,
                    ROUND(COUNT(CASE WHEN m.status = 'completed' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 2) as completion_rate
                FROM meetings m
                WHERE m.company_id = ? 
                AND m.start_time BETWEEN ? AND ?
            `, [companyId, startDate, endDate]);

            return {
                currentMRR,
                subscription: subscriptionInfo[0] || null,
                leadValue: leadValue[0],
                meetingValue: meetingValue[0],
                period: {
                    startDate,
                    endDate,
                    range: dateRange
                }
            };
        } finally {
            conn.release();
        }
    }

    // Export analytics data
    async exportAnalytics(companyId, dateRange = '30d', format = 'json') {
        const analytics = await this.getDashboardOverview(companyId, dateRange);
        
        if (format === 'csv') {
            return this.convertToCSV(analytics);
        }
        
        return analytics;
    }

    // Helper method to get date range
    getDateRange(range) {
        const endDate = new Date();
        const startDate = new Date();

        switch (range) {
            case '7d':
                startDate.setDate(endDate.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(endDate.getDate() - 30);
                break;
            case '90d':
                startDate.setDate(endDate.getDate() - 90);
                break;
            case '1y':
                startDate.setFullYear(endDate.getFullYear() - 1);
                break;
            default:
                startDate.setDate(endDate.getDate() - 30);
        }

        return {
            startDate: startDate.toISOString().split('T')[0] + ' 00:00:00',
            endDate: endDate.toISOString().split('T')[0] + ' 23:59:59'
        };
    }

    // Convert analytics data to CSV
    convertToCSV(data) {
        const csvRows = [];
        
        // Add headers
        csvRows.push('Metric,Value');
        
        // Add metrics
        if (data.metrics) {
            Object.entries(data.metrics).forEach(([key, value]) => {
                csvRows.push(`${key},${value}`);
            });
        }

        return csvRows.join('\n');
    }

    // Get real-time stats
    async getRealTimeStats(companyId) {
        const conn = await pool.getConnection();
        try {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            const [stats] = await conn.query(`
                SELECT 
                    (SELECT COUNT(*) FROM chat_threads WHERE company_id = ? AND is_active = TRUE) as active_conversations,
                    (SELECT COUNT(*) FROM chat_messages cm JOIN chat_threads ct ON cm.thread_id = ct.id 
                     WHERE ct.company_id = ? AND cm.created_at > ?) as messages_last_hour,
                    (SELECT COUNT(*) FROM chat_messages cm JOIN chat_threads ct ON cm.thread_id = ct.id 
                     WHERE ct.company_id = ? AND cm.created_at > ?) as messages_last_day,
                    (SELECT COUNT(*) FROM leads WHERE company_id = ? AND created_at > ?) as leads_last_day,
                    (SELECT COUNT(*) FROM meetings WHERE company_id = ? AND start_time BETWEEN ? AND ?) as meetings_today
            `, [companyId, companyId, oneHourAgo, companyId, oneDayAgo, companyId, oneDayAgo, companyId, oneDayAgo, now]);

            return stats[0];
        } finally {
            conn.release();
        }
    }
}

module.exports = new AnalyticsService();
