const { pool } = require('../config/db.config');

class IndustryTemplatesService {
    constructor() {
        this.templates = {
            'real-estate': {
                name: 'Real Estate',
                description: 'Perfect for real estate agencies and property management',
                icon: '🏠',
                color: '#3B82F6',
                agent: {
                    name: 'Property Assistant',
                    description: 'I help clients find their dream property and schedule viewings',
                    style: 'professional',
                    botInstructions: `You are a professional real estate assistant. Your role is to:
1. Greet visitors warmly and ask about their property needs
2. Collect key information: budget, location, property type, bedrooms, timeline
3. Schedule property viewings when interested
4. Provide property recommendations based on their criteria
5. Capture contact information for follow-up
6. Always be helpful, professional, and focused on finding their perfect property

Key phrases to use:
- "What type of property are you looking for?"
- "What's your budget range?"
- "Which areas are you interested in?"
- "When would you like to move?"
- "I can schedule a viewing for you"

When someone wants to schedule:
- Check available viewing times
- Collect their contact details
- Send calendar invitation
- Follow up with property details`,
                    keywords: ['property', 'house', 'apartment', 'rent', 'buy', 'real estate', 'viewing', 'mortgage'],
                    meetingDuration: 60
                },
                widget: {
                    initialMessage: 'Hi! I\'m here to help you find your perfect property. What type of property are you looking for?',
                    theme: 'light',
                    mainColor: '#3B82F6',
                    sendBgColor: '#3B82F6',
                    receiveBgColor: '#F3F4F6'
                },
                questions: [
                    'What type of property are you looking for? (House, Apartment, Condo, etc.)',
                    'What\'s your budget range?',
                    'Which areas or neighborhoods are you interested in?',
                    'How many bedrooms do you need?',
                    'When are you planning to move?',
                    'Are you buying or renting?'
                ]
            },
            
            'healthcare': {
                name: 'Healthcare & Clinics',
                description: 'Ideal for medical clinics, hospitals, and healthcare providers',
                icon: '🏥',
                color: '#EF4444',
                agent: {
                    name: 'Medical Assistant',
                    description: 'I help patients book appointments and answer medical inquiries',
                    style: 'professional',
                    botInstructions: `You are a professional medical clinic assistant. Your role is to:
1. Greet patients compassionately and professionally
2. Collect appointment details: reason for visit, preferred times, symptoms
3. Schedule appointments with appropriate healthcare providers
4. Answer basic clinic questions (hours, location, services)
5. Handle urgent inquiries appropriately
6. Maintain patient confidentiality and professionalism

Key phrases to use:
- "How can I help you today?"
- "What type of appointment do you need?"
- "Do you have a preferred doctor or time?"
- "Is this urgent or routine?"
- "I can schedule an appointment for you"

For urgent cases:
- Prioritize immediate scheduling
- Provide emergency contact information
- Document urgency level

When scheduling:
- Collect patient name and contact info
- Note appointment type and urgency
- Send calendar confirmation
- Provide preparation instructions`,
                    keywords: ['appointment', 'doctor', 'clinic', 'medical', 'health', 'symptoms', 'treatment'],
                    meetingDuration: 30
                },
                widget: {
                    initialMessage: 'Welcome to our clinic. How can I help you schedule your appointment today?',
                    theme: 'light',
                    mainColor: '#EF4444',
                    sendBgColor: '#EF4444',
                    receiveBgColor: '#FEF2F2'
                },
                questions: [
                    'What type of appointment do you need? (General checkup, Specialist, Follow-up, etc.)',
                    'Do you have a preferred doctor or healthcare provider?',
                    'What are your symptoms or reason for visit?',
                    'Is this urgent or routine?',
                    'What days and times work best for you?',
                    'Have you visited our clinic before?'
                ]
            },
            
            'salon': {
                name: 'Salon & Spa',
                description: 'Perfect for hair salons, spas, and beauty services',
                icon: '💇',
                color: '#EC4899',
                agent: {
                    name: 'Beauty Assistant',
                    description: 'I help clients book beauty services and manage appointments',
                    style: 'friendly',
                    botInstructions: `You are a friendly salon/spa assistant. Your role is to:
1. Greet clients warmly and make them feel welcome
2. Ask about desired services and preferences
3. Recommend appropriate services and stylists
4. Schedule appointments considering availability
5. Collect contact information and send confirmations
6. Handle special requests and accommodations

Key phrases to use:
- "Welcome! What service are you interested in today?"
- "Do you have a preferred stylist?"
- "What date and time works best for you?"
- "Any special requests or allergies I should know?"
- "I can help you choose the perfect service"

Service categories to know:
- Hair: cuts, color, styling, treatments
- Beauty: facials, waxing, makeup
- Spa: massages, body treatments
- Nails: manicures, pedicures

When booking:
- Note service type and duration
- Record stylist preference
- Mention any special requests
- Send appointment reminders`,
                    keywords: ['appointment', 'salon', 'hair', 'beauty', 'spa', 'stylist', 'treatment'],
                    meetingDuration: 60
                },
                widget: {
                    initialMessage: 'Hi there! Ready to look and feel your best? What service can I book for you today?',
                    theme: 'light',
                    mainColor: '#EC4899',
                    sendBgColor: '#EC4899',
                    receiveBgColor: '#FCE7F3'
                },
                questions: [
                    'What type of service are you looking for? (Hair, Nails, Spa, etc.)',
                    'Do you have a preferred stylist or technician?',
                    'What date and time would you like to come in?',
                    'Is this for a special occasion?',
                    'Any allergies or sensitivities I should know about?',
                    'Would you like to add any additional services?'
                ]
            },
            
            'restaurant': {
                name: 'Restaurant & Dining',
                description: 'Ideal for restaurants, cafes, and food services',
                icon: '🍽',
                color: '#F59E0B',
                agent: {
                    name: 'Dining Assistant',
                    description: 'I help customers make reservations and answer dining inquiries',
                    style: 'friendly',
                    botInstructions: `You are a friendly restaurant assistant. Your role is to:
1. Greet diners warmly and enthusiastically
2. Handle table reservations efficiently
3. Answer questions about menu, hours, and services
4. Accommodate special dietary needs and requests
5. Manage wait times and availability
6. Provide information about specials and events

Key phrases to use:
- "Welcome! How can I help you enjoy your dining experience?"
- "How many people will be dining?"
- "What date and time would you like your reservation?"
- "Any dietary restrictions or preferences?"
- "Do you have a preferred table area?"

Reservation details to collect:
- Party size and date/time
- Contact name and phone number
- Special occasions (birthday, anniversary)
- Dietary restrictions or preferences
- Table preferences (booth, window, etc.)

When handling wait times:
- Be honest about availability
- Offer alternative times
- Suggest bar seating if available
- Take contact info for notifications`,
                    keywords: ['reservation', 'table', 'restaurant', 'dining', 'menu', 'booking', 'waitlist'],
                    meetingDuration: 120
                },
                widget: {
                    initialMessage: 'Hungry? I can help you make the perfect reservation! How many people will be dining?',
                    theme: 'dark',
                    mainColor: '#F59E0B',
                    sendBgColor: '#F59E0B',
                    receiveBgColor: '#FEF3C7'
                },
                questions: [
                    'How many people will be dining?',
                    'What date and time would you like your reservation?',
                    'Do you have any dietary restrictions or preferences?',
                    'Is this for a special occasion?',
                    'Any table preferences? (Booth, window, patio, etc.)',
                    'Would you like to hear about today\'s specials?'
                ]
            }
        };
    }

    // Get all available templates
    getAllTemplates() {
        return Object.entries(this.templates).map(([key, template]) => ({
            id: key,
            ...template
        }));
    }

    // Get template by ID
    getTemplate(templateId) {
        return this.templates[templateId] || null;
    }

    // Apply template to company
    async applyTemplate(companyId, templateId, customizations = {}) {
        try {
            const template = this.getTemplate(templateId);
            if (!template) {
                throw new Error('Template not found');
            }

            const conn = await pool.getConnection();
            
            try {
                // Create agent from template
                const agentId = require('uuid').v4();
                await conn.query(`
                    INSERT INTO agents (
                        id, company_id, name, description, type, style, 
                        industry, bot_instructions, is_active, temperature, model
                    ) VALUES (?, ?, ?, ?, 'lead', ?, ?, ?, TRUE, 0.7, 'deepseek-chat')
                `, [
                    agentId,
                    companyId,
                    template.agent.name,
                    template.agent.description,
                    template.agent.style,
                    templateId.replace('-', '_'), // Convert to enum format
                    template.agent.botInstructions
                ]);

                // Create widget from template
                const widgetId = require('uuid').v4();
                await conn.query(`
                    INSERT INTO agent_widgets (
                        id, agent_id, company_id, initial_message, theme,
                        main_color, send_bg_color, receive_bg_color
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    widgetId,
                    agentId,
                    companyId,
                    customizations.initialMessage || template.widget.initialMessage,
                    customizations.theme || template.widget.theme,
                    customizations.mainColor || template.widget.mainColor,
                    customizations.sendBgColor || template.widget.sendBgColor,
                    customizations.receiveBgColor || template.widget.receiveBgColor
                ]);

                // Save template application record
                await conn.query(`
                    INSERT INTO company_templates (
                        id, company_id, template_id, agent_id, widget_id, customizations
                    ) VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    require('uuid').v4(),
                    companyId,
                    templateId,
                    agentId,
                    widgetId,
                    JSON.stringify(customizations)
                ]);

                return {
                    agentId,
                    widgetId,
                    template: templateId
                };
            } finally {
                conn.release();
            }
        } catch (error) {
            console.error('Error applying template:', error);
            throw error;
        }
    }

    // Get company's applied templates
    async getCompanyTemplates(companyId) {
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(`
                SELECT ct.*, a.name as agent_name, w.id as widget_id
                FROM company_templates ct
                JOIN agents a ON ct.agent_id = a.id
                LEFT JOIN agent_widgets w ON ct.widget_id = w.id
                WHERE ct.company_id = ?
                ORDER BY ct.created_at DESC
            `, [companyId]);

            return rows.map(row => ({
                ...row,
                template: this.getTemplate(row.template_id),
                customizations: JSON.parse(row.customizations || '{}')
            }));
        } finally {
            conn.release();
        }
    }

    // Update template customizations
    async updateTemplateCustomizations(companyId, templateId, customizations) {
        const conn = await pool.getConnection();
        try {
            // Update agent if needed
            if (customizations.agentName || customizations.botInstructions) {
                await conn.query(`
                    UPDATE agents 
                    SET name = COALESCE(?, name), 
                        bot_instructions = COALESCE(?, bot_instructions),
                        updated_at = CURRENT_TIMESTAMP(3)
                    WHERE id IN (
                        SELECT agent_id FROM company_templates 
                        WHERE company_id = ? AND template_id = ?
                    )
                `, [
                    customizations.agentName,
                    customizations.botInstructions,
                    companyId,
                    templateId
                ]);
            }

            // Update widget if needed
            if (customizations.initialMessage || customizations.theme || customizations.mainColor) {
                await conn.query(`
                    UPDATE agent_widgets 
                    SET initial_message = COALESCE(?, initial_message),
                        theme = COALESCE(?, theme),
                        main_color = COALESCE(?, main_color),
                        updated_at = CURRENT_TIMESTAMP(3)
                    WHERE id IN (
                        SELECT widget_id FROM company_templates 
                        WHERE company_id = ? AND template_id = ?
                    )
                `, [
                    customizations.initialMessage,
                    customizations.theme,
                    customizations.mainColor,
                    companyId,
                    templateId
                ]);
            }

            // Update customizations record
            await conn.query(`
                UPDATE company_templates 
                SET customizations = ?, updated_at = CURRENT_TIMESTAMP(3)
                WHERE company_id = ? AND template_id = ?
            `, [
                JSON.stringify(customizations),
                companyId,
                templateId
            ]);

            return true;
        } finally {
            conn.release();
        }
    }

    // Get template questions
    getTemplateQuestions(templateId) {
        const template = this.getTemplate(templateId);
        return template?.questions || [];
    }

    // Generate template-specific responses
    generateTemplateResponse(templateId, userInput, context = {}) {
        const template = this.getTemplate(templateId);
        if (!template) return null;

        const input = userInput.toLowerCase();
        
        // Real estate responses
        if (templateId === 'real-estate') {
            if (input.includes('budget') || input.includes('price')) {
                return "What's your budget range? This will help me find properties that match your financial goals.";
            }
            if (input.includes('bedroom') || input.includes('bed')) {
                return "How many bedrooms do you need? I'll search for homes with the right space for your family.";
            }
            if (input.includes('area') || input.includes('location')) {
                return "Which neighborhoods or areas are you most interested in? I can show you what's available in your preferred locations.";
            }
            if (input.includes('schedule') || input.includes('viewing')) {
                return "Great! I can schedule a property viewing for you. What days and times work best?";
            }
        }

        // Healthcare responses
        if (templateId === 'healthcare') {
            if (input.includes('urgent') || input.includes('emergency')) {
                return "I understand this is urgent. Let me connect you with our emergency line immediately, or please call 911 if it's a life-threatening emergency.";
            }
            if (input.includes('appointment') || input.includes('book')) {
                return "I can help you schedule an appointment. What type of care do you need and when would you like to come in?";
            }
            if (input.includes('doctor') || input.includes('provider')) {
                return "Do you have a preferred doctor or healthcare provider? I'll check their availability for you.";
            }
        }

        // Salon responses
        if (templateId === 'salon') {
            if (input.includes('hair') || input.includes('cut')) {
                return "I'd love to help with your hair! Are you looking for a cut, color, or styling service?";
            }
            if (input.includes('stylist') || input.includes('technician')) {
                return "Do you have a preferred stylist? I can check their availability or recommend someone perfect for your needs.";
            }
            if (input.includes('special') || input.includes('occasion')) {
                return "How exciting! What's the special occasion? I'll make sure you get the perfect treatment for your event.";
            }
        }

        // Restaurant responses
        if (templateId === 'restaurant') {
            if (input.includes('reservation') || input.includes('book')) {
                return "I'd be happy to make a reservation for you! How many people will be dining and what time works best?";
            }
            if (input.includes('menu') || input.includes('food')) {
                return "Our menu features seasonal specialties! Do you have any dietary restrictions I should know about?";
            }
            if (input.includes('wait') || input.includes('availability')) {
                return "Let me check our availability for you. What time were you hoping to dine with us?";
            }
        }

        return null;
    }

    // Get template analytics
    async getTemplateAnalytics(companyId, templateId, dateRange = '30d') {
        const conn = await pool.getConnection();
        try {
            const { startDate, endDate } = this.getDateRange(dateRange);

            const [analytics] = await conn.query(`
                SELECT 
                    COUNT(DISTINCT ct.id) as conversations,
                    COUNT(DISTINCT c.id) as leads,
                    COUNT(DISTINCT CASE WHEN l.status = 'converted' THEN l.id END) as conversions,
                    AVG(l.score) as avg_lead_score,
                    COUNT(DISTINCT m.id) as meetings_booked
                FROM company_templates ct_temp
                JOIN agents a ON ct_temp.agent_id = a.id
                LEFT JOIN chat_threads ct ON a.id = ct.agent_id AND ct.created_at BETWEEN ? AND ?
                LEFT JOIN customers c ON ct.customer_id = c.id
                LEFT JOIN leads l ON c.id = l.customer_id AND l.created_at BETWEEN ? AND ?
                LEFT JOIN meetings m ON l.id = m.customer_id AND m.start_time BETWEEN ? AND ?
                WHERE ct_temp.company_id = ? AND ct_temp.template_id = ?
            `, [startDate, endDate, startDate, endDate, startDate, endDate, companyId, templateId]);

            return analytics[0] || {
                conversations: 0,
                leads: 0,
                conversions: 0,
                avg_lead_score: 0,
                meetings_booked: 0
            };
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

module.exports = new IndustryTemplatesService();
