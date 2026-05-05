const { pool } = require('../config/db.config');

class LeadScoringService {
    constructor() {
        this.scoringRules = {
            // Engagement factors
            messageCount: {
                high: { min: 10, score: 25 },
                medium: { min: 5, score: 15 },
                low: { min: 2, score: 5 }
            },
            responseTime: {
                quick: { max: 300, score: 20 }, // 5 minutes
                normal: { max: 1800, score: 10 }, // 30 minutes
                slow: { max: 3600, score: 5 } // 1 hour
            },
            conversationDuration: {
                long: { min: 1800, score: 15 }, // 30 minutes
                medium: { min: 600, score: 10 }, // 10 minutes
                short: { min: 300, score: 5 } // 5 minutes
            },
            
            // Behavioral factors
            meetingBooked: { score: 30 },
            whatsappOptIn: { score: 15 },
            returnVisitor: { score: 20 },
            
            // Content factors
            containsKeywords: {
                buy: { score: 25 },
                price: { score: 20 },
                interested: { score: 15 },
                demo: { score: 20 },
                quote: { score: 18 }
            },
            
            // Timing factors
            businessHours: { score: 10 },
            multipleSessions: { score: 15 },
            
            // Source factors
            source: {
                whatsapp: { score: 25 },
                website: { score: 15 },
                referral: { score: 30 }
            }
        };
    }

    // Calculate lead score
    async calculateLeadScore(customerId, companyId, threadId = null) {
        try {
            let score = 0;
            const factors = [];

            // Get conversation data
            const conversationData = await this.getConversationData(customerId, companyId, threadId);
            
            // Message count scoring
            const messageScore = this.calculateMessageScore(conversationData.messageCount);
            score += messageScore.points;
            factors.push({ factor: 'message_count', points: messageScore.points, details: messageScore.details });

            // Response time scoring
            const responseScore = this.calculateResponseScore(conversationData.avgResponseTime);
            score += responseScore.points;
            factors.push({ factor: 'response_time', points: responseScore.points, details: responseScore.details });

            // Conversation duration scoring
            const durationScore = this.calculateDurationScore(conversationData.duration);
            score += durationScore.points;
            factors.push({ factor: 'conversation_duration', points: durationScore.points, details: durationScore.details });

            // Keyword analysis
            const keywordScore = this.calculateKeywordScore(conversationData.messages);
            score += keywordScore.points;
            factors.push({ factor: 'keywords', points: keywordScore.points, details: keywordScore.details });

            // Behavioral scoring
            const behaviorScore = await this.calculateBehaviorScore(customerId, companyId);
            score += behaviorScore.points;
            factors.push({ factor: 'behavior', points: behaviorScore.points, details: behaviorScore.details });

            // Timing scoring
            const timingScore = this.calculateTimingScore(conversationData);
            score += timingScore.points;
            factors.push({ factor: 'timing', points: timingScore.points, details: timingScore.details });

            // Cap score at 100
            score = Math.min(score, 100);

            // Determine lead category
            const category = this.categorizeLead(score);

            return {
                score,
                category,
                factors,
                calculatedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error calculating lead score:', error);
            return { score: 0, category: 'cold', factors: [], calculatedAt: new Date().toISOString() };
        }
    }

    // Get conversation data for scoring
    async getConversationData(customerId, companyId, threadId = null) {
        const conn = await pool.getConnection();
        try {
            let query = `
                SELECT 
                    cm.id,
                    cm.content,
                    cm.role,
                    cm.created_at,
                    ct.id as thread_id,
                    ct.channel,
                    ct.created_at as thread_created_at
                FROM chat_messages cm
                JOIN chat_threads ct ON cm.thread_id = ct.id
                WHERE ct.customer_id = ? 
                AND ct.company_id = ?
            `;
            const params = [customerId, companyId];

            if (threadId) {
                query += ' AND ct.id = ?';
                params.push(threadId);
            }

            query += ' ORDER BY cm.created_at ASC';

            const [messages] = await conn.query(query, params);

            // Calculate metrics
            const customerMessages = messages.filter(m => m.role === 'customer');
            const teamMessages = messages.filter(m => m.role === 'team');

            // Response times
            const responseTimes = [];
            for (let i = 0; i < messages.length - 1; i++) {
                if (messages[i].role === 'customer' && messages[i + 1].role === 'team') {
                    const responseTime = new Date(messages[i + 1].created_at) - new Date(messages[i].created_at);
                    responseTimes.push(responseTime);
                }
            }

            const avgResponseTime = responseTimes.length > 0 
                ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
                : 0;

            // Conversation duration
            const duration = messages.length > 1 
                ? new Date(messages[messages.length - 1].created_at) - new Date(messages[0].created_at)
                : 0;

            // Channel
            const channel = messages[0]?.channel || 'web';

            return {
                messageCount: customerMessages.length,
                avgResponseTime,
                duration,
                messages,
                channel,
                threadCreatedAt: messages[0]?.thread_created_at
            };
        } finally {
            conn.release();
        }
    }

    // Calculate message count score
    calculateMessageScore(messageCount) {
        const rules = this.scoringRules.messageCount;
        
        if (messageCount >= rules.high.min) {
            return { points: rules.high.score, details: `High engagement (${messageCount} messages)` };
        } else if (messageCount >= rules.medium.min) {
            return { points: rules.medium.score, details: `Medium engagement (${messageCount} messages)` };
        } else if (messageCount >= rules.low.min) {
            return { points: rules.low.score, details: `Low engagement (${messageCount} messages)` };
        }
        
        return { points: 0, details: 'Minimal engagement' };
    }

    // Calculate response time score
    calculateResponseScore(avgResponseTime) {
        const rules = this.scoringRules.responseTime;
        
        if (avgResponseTime <= rules.quick.max) {
            return { points: rules.quick.score, details: `Quick response (${Math.round(avgResponseTime / 1000)}s avg)` };
        } else if (avgResponseTime <= rules.normal.max) {
            return { points: rules.normal.score, details: `Normal response (${Math.round(avgResponseTime / 1000)}s avg)` };
        } else if (avgResponseTime <= rules.slow.max) {
            return { points: rules.slow.score, details: `Slow response (${Math.round(avgResponseTime / 1000)}s avg)` };
        }
        
        return { points: 0, details: 'Very slow response' };
    }

    // Calculate conversation duration score
    calculateDurationScore(duration) {
        const rules = this.scoringRules.conversationDuration;
        const durationMinutes = duration / (1000 * 60);
        
        if (durationMinutes >= rules.long.min) {
            return { points: rules.long.score, details: `Long conversation (${Math.round(durationMinutes)} min)` };
        } else if (durationMinutes >= rules.medium.min) {
            return { points: rules.medium.score, details: `Medium conversation (${Math.round(durationMinutes)} min)` };
        } else if (durationMinutes >= rules.short.min) {
            return { points: rules.short.score, details: `Short conversation (${Math.round(durationMinutes)} min)` };
        }
        
        return { points: 0, details: 'Very brief conversation' };
    }

    // Calculate keyword score
    calculateKeywordScore(messages) {
        const allText = messages.map(m => m.content.toLowerCase()).join(' ');
        let score = 0;
        const foundKeywords = [];

        Object.entries(this.scoringRules.containsKeywords).forEach(([keyword, data]) => {
            if (allText.includes(keyword)) {
                score += data.score;
                foundKeywords.push(keyword);
            }
        });

        return { 
            points: score, 
            details: foundKeywords.length > 0 ? `Found keywords: ${foundKeywords.join(', ')}` : 'No buying signals detected'
        };
    }

    // Calculate behavioral score
    async calculateBehaviorScore(customerId, companyId) {
        const conn = await pool.getConnection();
        try {
            let score = 0;
            const behaviors = [];

            // Check if meeting was booked
            const [meetings] = await conn.query(`
                SELECT COUNT(*) as count FROM meetings 
                WHERE customer_id = ? AND company_id = ?
            `, [customerId, companyId]);

            if (meetings[0].count > 0) {
                score += this.scoringRules.meetingBooked.score;
                behaviors.push('Meeting booked');
            }

            // Check WhatsApp opt-in
            const [whatsappThreads] = await conn.query(`
                SELECT COUNT(*) as count FROM chat_threads 
                WHERE customer_id = ? AND company_id = ? AND channel = 'whatsapp'
            `, [customerId, companyId]);

            if (whatsappThreads[0].count > 0) {
                score += this.scoringRules.whatsappOptIn.score;
                behaviors.push('WhatsApp opt-in');
            }

            // Check return visitor
            const [threads] = await conn.query(`
                SELECT COUNT(*) as count FROM chat_threads 
                WHERE customer_id = ? AND company_id = ?
            `, [customerId, companyId]);

            if (threads[0].count > 1) {
                score += this.scoringRules.returnVisitor.score;
                behaviors.push('Return visitor');
            }

            return { 
                points: score, 
                details: behaviors.length > 0 ? behaviors.join(', ') : 'No special behaviors detected'
            };
        } finally {
            conn.release();
        }
    }

    // Calculate timing score
    calculateTimingScore(conversationData) {
        let score = 0;
        const timingFactors = [];

        // Check if conversation happened during business hours
        const conversationTime = new Date(conversationData.threadCreatedAt);
        const hour = conversationTime.getHours();
        const day = conversationTime.getDay();
        
        // Business hours: 9 AM - 6 PM, Monday - Friday
        if (day >= 1 && day <= 5 && hour >= 9 && hour <= 18) {
            score += this.scoringRules.businessHours.score;
            timingFactors.push('Business hours');
        }

        // Check for multiple sessions (would need more complex tracking)
        // For now, just check if conversation spanned multiple time periods
        if (conversationData.duration > 4 * 60 * 60 * 1000) { // 4 hours
            score += this.scoringRules.multipleSessions.score;
            timingFactors.push('Extended engagement');
        }

        // Source-based scoring
        const sourceScore = this.scoringRules.source[conversationData.channel];
        if (sourceScore) {
            score += sourceScore.score;
            timingFactors.push(`${conversationData.channel} source`);
        }

        return { 
            points: score, 
            details: timingFactors.length > 0 ? timingFactors.join(', ') : 'No special timing factors'
        };
    }

    // Categorize lead based on score
    categorizeLead(score) {
        if (score >= 80) return 'hot';
        if (score >= 60) return 'warm';
        if (score >= 40) return 'cool';
        return 'cold';
    }

    // Update lead score in database
    async updateLeadScore(leadId, scoreData) {
        const conn = await pool.getConnection();
        try {
            await conn.query(`
                UPDATE leads 
                SET score = ?, score_factors = ?, score_updated_at = ?
                WHERE id = ?
            `, [
                scoreData.score,
                JSON.stringify(scoreData.factors),
                scoreData.calculatedAt,
                leadId
            ]);

            // Update lead status based on score
            const newStatus = this.getRecommendedStatus(scoreData.score);
            await conn.query(
                'UPDATE leads SET status = ? WHERE id = ? AND score < ?',
                [newStatus, leadId, scoreData.score]
            );

            return true;
        } finally {
            conn.release();
        }
    }

    // Get recommended status based on score
    getRecommendedStatus(score) {
        if (score >= 80) return 'qualified';
        if (score >= 60) return 'contacted';
        return 'new';
    }

    // Batch score leads for a company
    async batchScoreLeads(companyId, limit = 100) {
        const conn = await pool.getConnection();
        try {
            // Get leads that need scoring
            const [leads] = await conn.query(`
                SELECT l.id, l.customer_id, l.thread_id, l.score_updated_at
                FROM leads l
                WHERE l.company_id = ?
                AND (l.score_updated_at IS NULL 
                     OR l.score_updated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR))
                ORDER BY l.created_at DESC
                LIMIT ?
            `, [companyId, limit]);

            const results = [];
            
            for (const lead of leads) {
                try {
                    const scoreData = await this.calculateLeadScore(
                        lead.customer_id, 
                        companyId, 
                        lead.thread_id
                    );
                    
                    await this.updateLeadScore(lead.id, scoreData);
                    
                    results.push({
                        leadId: lead.id,
                        score: scoreData.score,
                        category: scoreData.category,
                        previousScore: lead.score || 0
                    });
                } catch (error) {
                    console.error(`Error scoring lead ${lead.id}:`, error);
                }
            }

            return results;
        } finally {
            conn.release();
        }
    }

    // Get lead scoring statistics
    async getScoringStats(companyId, dateRange = '30d') {
        const conn = await pool.getConnection();
        try {
            const { startDate, endDate } = this.getDateRange(dateRange);

            const [stats] = await conn.query(`
                SELECT 
                    COUNT(*) as total_leads,
                    COUNT(CASE WHEN score >= 80 THEN 1 END) as hot_leads,
                    COUNT(CASE WHEN score >= 60 AND score < 80 THEN 1 END) as warm_leads,
                    COUNT(CASE WHEN score >= 40 AND score < 60 THEN 1 END) as cool_leads,
                    COUNT(CASE WHEN score < 40 THEN 1 END) as cold_leads,
                    AVG(score) as avg_score,
                    MAX(score) as max_score,
                    MIN(score) as min_score,
                    COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted_leads
                FROM leads
                WHERE company_id = ? 
                AND created_at BETWEEN ? AND ?
            `, [companyId, startDate, endDate]);

            // Conversion rate by score category
            const [conversionByCategory] = await conn.query(`
                SELECT 
                    CASE 
                        WHEN score >= 80 THEN 'Hot'
                        WHEN score >= 60 THEN 'Warm'
                        WHEN score >= 40 THEN 'Cool'
                        ELSE 'Cold'
                    END as category,
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted,
                    ROUND(COUNT(CASE WHEN status = 'converted' THEN 1 END) * 100.0 / COUNT(*), 2) as conversion_rate
                FROM leads
                WHERE company_id = ? 
                AND created_at BETWEEN ? AND ?
                GROUP BY 
                    CASE 
                        WHEN score >= 80 THEN 'Hot'
                        WHEN score >= 60 THEN 'Warm'
                        WHEN score >= 40 THEN 'Cool'
                        ELSE 'Cold'
                    END
                ORDER BY 
                    CASE 
                        WHEN score >= 80 THEN 1
                        WHEN score >= 60 THEN 2
                        WHEN score >= 40 THEN 3
                        ELSE 4
                    END
            `, [companyId, startDate, endDate]);

            return {
                summary: stats[0],
                conversionByCategory
            };
        } finally {
            conn.release();
        }
    }

    // Get scoring rules (for admin configuration)
    getScoringRules() {
        return this.scoringRules;
    }

    // Update scoring rules
    updateScoringRules(newRules) {
        // This would typically be stored in database
        // For now, merge with existing rules
        Object.assign(this.scoringRules, newRules);
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
            default:
                startDate.setDate(endDate.getDate() - 30);
        }

        return {
            startDate: startDate.toISOString().split('T')[0] + ' 00:00:00',
            endDate: endDate.toISOString().split('T')[0] + ' 23:59:59'
        };
    }
}

module.exports = new LeadScoringService();
