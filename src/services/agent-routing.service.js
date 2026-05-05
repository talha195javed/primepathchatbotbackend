const { pool } = require('../config/db.config');

class AgentRoutingService {
    constructor() {
        this.routingStrategies = {
            round_robin: this.roundRobinRouting.bind(this),
            least_busy: this.leastBusyRouting.bind(this),
            skill_based: this.skillBasedRouting.bind(this),
            availability_based: this.availabilityBasedRouting.bind(this)
        };
    }

    // Route conversation to appropriate agent
    async routeConversation(companyId, conversationData = {}) {
        try {
            // Get company's routing strategy
            const strategy = await this.getCompanyRoutingStrategy(companyId);
            
            // Get available agents
            const availableAgents = await this.getAvailableAgents(companyId);
            
            if (availableAgents.length === 0) {
                // No agents available, use default agent
                const defaultAgent = await this.getDefaultAgent(companyId);
                return defaultAgent;
            }

            // Apply routing strategy
            const selectedAgent = await this.routingStrategies[strategy](
                availableAgents, 
                conversationData
            );

            if (selectedAgent) {
                // Update agent's current load
                await this.updateAgentLoad(selectedAgent.id, 1);
                
                // Log routing decision
                await this.logRoutingDecision(companyId, selectedAgent.id, strategy, conversationData);
            }

            return selectedAgent;
        } catch (error) {
            console.error('Error in agent routing:', error);
            // Fallback to default agent
            return await this.getDefaultAgent(companyId);
        }
    }

    // Get company's routing strategy
    async getCompanyRoutingStrategy(companyId) {
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(
                'SELECT routing_strategy FROM companies WHERE id = ?',
                [companyId]
            );

            return rows[0]?.routing_strategy || 'round_robin';
        } finally {
            conn.release();
        }
    }

    // Get available agents for a company
    async getAvailableAgents(companyId) {
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(`
                SELECT 
                    a.*,
                    COUNT(ct.id) as current_conversations,
                    MAX(ct.updated_at) as last_activity,
                    u.is_online,
                    u.last_seen_at
                FROM agents a
                LEFT JOIN chat_threads ct ON a.id = ct.agent_id AND ct.is_active = TRUE
                LEFT JOIN users u ON a.id = u.agent_id
                WHERE a.company_id = ? 
                AND a.is_active = TRUE
                GROUP BY a.id
                HAVING current_conversations < a.max_conversations
                ORDER BY 
                    CASE 
                        WHEN u.is_online = TRUE THEN 1
                        ELSE 2
                    END,
                    current_conversations ASC,
                    a.created_at ASC
            `, [companyId]);

            return rows;
        } finally {
            conn.release();
        }
    }

    // Get default agent for a company
    async getDefaultAgent(companyId) {
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(`
                SELECT * FROM agents 
                WHERE company_id = ? 
                AND is_active = TRUE 
                ORDER BY created_at ASC 
                LIMIT 1
            `, [companyId]);

            return rows[0] || null;
        } finally {
            conn.release();
        }
    }

    // Round-robin routing
    async roundRobinRouting(agents, conversationData) {
        const conn = await pool.getConnection();
        try {
            // Get last assigned agent for round-robin
            const [lastAssignment] = await conn.query(`
                SELECT agent_id FROM routing_logs 
                WHERE company_id = ?
                ORDER BY created_at DESC 
                LIMIT 1
            `, [conversationData.companyId]);

            let lastAgentId = lastAssignment[0]?.agent_id;
            let nextAgent = null;

            // Find next agent in the list
            if (lastAgentId) {
                const lastAgentIndex = agents.findIndex(a => a.id === lastAgentId);
                if (lastAgentIndex >= 0 && lastAgentIndex < agents.length - 1) {
                    nextAgent = agents[lastAgentIndex + 1];
                }
            }

            // If no next agent found, use first available
            return nextAgent || agents[0];
        } finally {
            conn.release();
        }
    }

    // Least busy routing
    async leastBusyRouting(agents, conversationData) {
        return agents.reduce((least, current) => {
            if (current.current_conversations < least.current_conversations) {
                return current;
            }
            return least;
        });
    }

    // Skill-based routing
    async skillBasedRouting(agents, conversationData) {
        // Extract skills from conversation
        const requiredSkills = this.extractSkillsFromConversation(conversationData);
        
        if (requiredSkills.length === 0) {
            // No specific skills required, use least busy
            return await this.leastBusyRouting(agents, conversationData);
        }

        // Score agents based on skill match
        const scoredAgents = agents.map(agent => {
            const agentSkills = agent.skills || [];
            const skillScore = this.calculateSkillMatch(requiredSkills, agentSkills);
            const loadScore = 1 / (agent.current_conversations + 1); // Prefer less busy
            
            return {
                ...agent,
                skillScore,
                loadScore,
                totalScore: (skillScore * 0.7) + (loadScore * 0.3)
            };
        });

        // Return agent with highest score
        return scoredAgents.reduce((best, current) => 
            current.totalScore > best.totalScore ? current : best
        );
    }

    // Availability-based routing
    async availabilityBasedRouting(agents, conversationData) {
        // Filter online agents first
        const onlineAgents = agents.filter(agent => agent.is_online);
        
        if (onlineAgents.length > 0) {
            // Among online agents, use least busy
            return await this.leastBusyRouting(onlineAgents, conversationData);
        }

        // If no online agents, check recent activity
        const recentlyActive = agents.filter(agent => {
            if (!agent.last_seen_at) return false;
            const hoursSinceLastSeen = (Date.now() - new Date(agent.last_seen_at).getTime()) / (1000 * 60 * 60);
            return hoursSinceLastSeen < 24; // Active in last 24 hours
        });

        if (recentlyActive.length > 0) {
            return await this.leastBusyRouting(recentlyActive, conversationData);
        }

        // Fallback to any available agent
        return agents[0];
    }

    // Extract skills from conversation
    extractSkillsFromConversation(conversationData) {
        const skills = [];
        const message = conversationData.message?.toLowerCase() || '';
        
        // Language detection
        if (this.containsArabic(message)) {
            skills.push('arabic');
        } else {
            skills.push('english');
        }

        // Topic detection
        if (message.includes('sale') || message.includes('price') || message.includes('cost')) {
            skills.push('sales');
        }
        
        if (message.includes('support') || message.includes('help') || message.includes('issue')) {
            skills.push('support');
        }
        
        if (message.includes('booking') || message.includes('appointment') || message.includes('schedule')) {
            skills.push('booking');
        }

        // Urgency detection
        if (message.includes('urgent') || message.includes('emergency') || message.includes('asap')) {
            skills.push('urgent');
        }

        return skills;
    }

    // Check if text contains Arabic
    containsArabic(text) {
        const arabicPattern = /[\u0600-\u06FF]/;
        return arabicPattern.test(text);
    }

    // Calculate skill match score
    calculateSkillMatch(requiredSkills, agentSkills) {
        if (requiredSkills.length === 0) return 1;
        
        const matchedSkills = requiredSkills.filter(skill => 
            agentSkills.includes(skill)
        );
        
        return matchedSkills.length / requiredSkills.length;
    }

    // Update agent's current load
    async updateAgentLoad(agentId, increment = 1) {
        const conn = await pool.getConnection();
        try {
            await conn.query(
                'UPDATE agents SET current_load = current_load + ? WHERE id = ?',
                [increment, agentId]
            );
        } finally {
            conn.release();
        }
    }

    // Log routing decision
    async logRoutingDecision(companyId, agentId, strategy, conversationData) {
        const conn = await pool.getConnection();
        try {
            await conn.query(`
                INSERT INTO routing_logs (
                    id, company_id, agent_id, strategy, conversation_data, created_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
            `, [
                require('uuid').v4(),
                companyId,
                agentId,
                strategy,
                JSON.stringify(conversationData)
            ]);
        } finally {
            conn.release();
        }
    }

    // Handle agent capacity overflow
    async handleCapacityOverflow(companyId, agentId) {
        try {
            // Get overflow agents (agents with lower priority)
            const overflowAgents = await this.getOverflowAgents(companyId, agentId);
            
            if (overflowAgents.length === 0) {
                return null;
            }

            // Select best overflow agent
            const bestOverflow = await this.leastBusyRouting(overflowAgents, {});
            
            // Reassign some conversations
            const conversationsToReassign = await this.getConversationsToReassign(agentId, 2);
            
            for (const conversation of conversationsToReassign) {
                await this.reassignConversation(conversation.id, bestOverflow.id);
            }

            return bestOverflow;
        } catch (error) {
            console.error('Error handling capacity overflow:', error);
            return null;
        }
    }

    // Get overflow agents
    async getOverflowAgents(companyId, primaryAgentId) {
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(`
                SELECT * FROM agents 
                WHERE company_id = ? 
                AND id != ?
                AND is_active = TRUE
                AND current_conversations < max_conversations
                ORDER BY priority ASC, current_conversations ASC
                LIMIT 5
            `, [companyId, primaryAgentId]);

            return rows;
        } finally {
            conn.release();
        }
    }

    // Get conversations to reassign
    async getConversationsToReassign(agentId, limit = 2) {
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(`
                SELECT ct.* FROM chat_threads ct
                WHERE ct.agent_id = ? 
                AND ct.is_active = TRUE
                AND ct.current_handler = 'agent'
                ORDER BY ct.created_at DESC
                LIMIT ?
            `, [agentId, limit]);

            return rows;
        } finally {
            conn.release();
        }
    }

    // Reassign conversation to different agent
    async reassignConversation(threadId, newAgentId) {
        const conn = await pool.getConnection();
        try {
            await conn.query(
                'UPDATE chat_threads SET agent_id = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
                [newAgentId, threadId]
            );

            // Notify via socket
            const { getSocket } = require('./helpers/socket.helper.service');
            const io = getSocket();
            io.to(`thread-${threadId}`).emit('conversation-reassigned', {
                threadId,
                newAgentId,
                timestamp: new Date().toISOString()
            });
        } finally {
            conn.release();
        }
    }

    // Get routing statistics
    async getRoutingStats(companyId, dateRange = '30d') {
        const conn = await pool.getConnection();
        try {
            const { startDate, endDate } = this.getDateRange(dateRange);

            const [stats] = await conn.query(`
                SELECT 
                    COUNT(*) as total_routings,
                    strategy,
                    COUNT(*) as usage_count,
                    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM routing_logs WHERE company_id = ? AND created_at BETWEEN ? AND ?), 2) as usage_percentage
                FROM routing_logs
                WHERE company_id = ? 
                AND created_at BETWEEN ? AND ?
                GROUP BY strategy
                ORDER BY usage_count DESC
            `, [companyId, startDate, endDate, companyId, startDate, endDate]);

            // Agent performance
            const [agentStats] = await conn.query(`
                SELECT 
                    a.name as agent_name,
                    COUNT(rl.id) as assignments,
                    AVG(TIMESTAMPDIFF(MINUTE, rl.created_at, ct.updated_at)) as avg_handling_time_minutes,
                    COUNT(CASE WHEN ct.is_active = FALSE THEN 1 END) as completed_conversations
                FROM routing_logs rl
                JOIN agents a ON rl.agent_id = a.id
                LEFT JOIN chat_threads ct ON rl.agent_id = ct.agent_id 
                    AND ct.created_at >= rl.created_at
                    AND ct.created_at <= DATE_ADD(rl.created_at, INTERVAL 1 HOUR)
                WHERE rl.company_id = ? 
                AND rl.created_at BETWEEN ? AND ?
                GROUP BY a.id, a.name
                ORDER BY assignments DESC
            `, [companyId, startDate, endDate]);

            return {
                strategyStats: stats,
                agentStats
            };
        } finally {
            conn.release();
        }
    }

    // Update agent availability status
    async updateAgentStatus(agentId, isOnline, status = 'available') {
        const conn = await pool.getConnection();
        try {
            await conn.query(`
                UPDATE users 
                SET is_online = ?, last_seen_at = CURRENT_TIMESTAMP(3)
                WHERE agent_id = ?
            `, [isOnline, agentId]);

            // Emit status change
            const { getSocket } = require('./helpers/socket.helper.service');
            const io = getSocket();
            io.to(`company-${agentId}`).emit('agent-status-changed', {
                agentId,
                isOnline,
                status,
                timestamp: new Date().toISOString()
            });
        } finally {
            conn.release();
        }
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

module.exports = new AgentRoutingService();
