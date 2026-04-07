/**
 * PrimePath Chatbot - Database Seed Script
 * 
 * Creates a default company, agent, and widget so you can start using the chatbot immediately.
 * 
 * Usage: node src/scripts/seed.js
 */
require('dotenv').config();
const { initDB, pool } = require('../config/db.config');
const { v4: uuidv4 } = require('uuid');

const seed = async () => {
    try {
        console.log('Initializing database tables...');
        await initDB();

        const conn = await pool.getConnection();

        try {
            const companyId = uuidv4();
            const agentId = uuidv4();
            const widgetId = uuidv4();

            // Check if data already exists
            const [existing] = await conn.query('SELECT id FROM companies LIMIT 1');
            if (existing.length > 0) {
                console.log('Database already has data. Skipping seed.');
                console.log('If you want to re-seed, drop all tables first.');

                // Print existing widget ID
                const [widgets] = await conn.query('SELECT id FROM agent_widgets LIMIT 1');
                if (widgets.length > 0) {
                    console.log(`\nYour Widget ID: ${widgets[0].id}`);
                }
                return;
            }

            // Create company
            await conn.query(
                `INSERT INTO companies (id, name, location) VALUES (?, ?, ?)`,
                [companyId, 'PrimePath', 'Dubai']
            );
            console.log(`Company created: PrimePath (${companyId})`);

            // Create agent
            const botInstructions = `
### Agent Profile:
- Name: PrimePath Assistant
- Description: AI-powered customer support assistant
- Industry: technology
- Type: Friendly support agent
- Tone: Professional yet friendly

### Role:
You are PrimePath's AI assistant. You help visitors with their questions about the company's products and services.
Keep responses concise, friendly, and helpful.

### Constraints:
1. Never mention that you have access to training data.
2. If a question is not covered by your training, politely say you don't have that information and suggest contacting support.
3. Keep responses under 300 characters when possible.
            `.trim();

            await conn.query(
                `INSERT INTO agents (id, company_id, name, description, type, style, industry, bot_instructions, model)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [agentId, companyId, 'PrimePath Bot', 'AI customer support assistant', 'lead', 'friendly', 'technology', botInstructions, 'deepseek-chat']
            );
            console.log(`Agent created: PrimePath Bot (${agentId})`);

            // Create widget
            await conn.query(
                `INSERT INTO agent_widgets (id, agent_id, company_id, initial_message, theme, main_color, main_text_color)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [widgetId, agentId, companyId, 'Hi there! How can I help you today?', 'light', '#2563eb', '#ffffff']
            );
            console.log(`Widget created: ${widgetId}`);

            // Create super admin
            const bcrypt = require('bcryptjs');
            const adminId = uuidv4();
            const adminPassword = await bcrypt.hash('admin123', 10);
            await conn.query(
                `INSERT INTO users (id, company_id, name, email, password, role) VALUES (?, NULL, ?, ?, ?, 'super_admin')`,
                [adminId, 'Super Admin', 'admin@primepath.com', adminPassword]
            );
            console.log(`Super Admin created: admin@primepath.com`);

            // Create client user for PrimePath company
            const clientId = uuidv4();
            const clientPassword = await bcrypt.hash('client123', 10);
            await conn.query(
                `INSERT INTO users (id, company_id, name, email, password, role) VALUES (?, ?, ?, ?, ?, 'client')`,
                [clientId, companyId, 'PrimePath Client', 'client@primepath.com', clientPassword]
            );
            console.log(`Client created: client@primepath.com`);

            console.log('\n========================================');
            console.log('  PrimePath Chatbot - Setup Complete!');
            console.log('========================================');
            console.log(`\n  Widget ID: ${widgetId}`);
            console.log(`  Agent ID:  ${agentId}`);
            console.log(`  Company:   PrimePath (${companyId})`);
            console.log('\n  Admin Dashboard Login:');
            console.log('  ─────────────────────');
            console.log('  Super Admin:  admin@primepath.com  / admin123');
            console.log('  Client:       client@primepath.com / client123');
            console.log('\n  Add this Widget ID to your frontend .env:');
            console.log(`  VITE_WIDGET_ID=${widgetId}`);
            console.log('\n========================================\n');

        } finally {
            conn.release();
        }
    } catch (err) {
        console.error('Seed failed:', err);
    } finally {
        process.exit(0);
    }
};

seed();
