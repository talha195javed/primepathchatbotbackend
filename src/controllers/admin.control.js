const { pool } = require('../config/db.config');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const userModel = require('../models/user.model');

// ─── CLIENTS (Super Admin only) ────────────────────────────────

const getAllClients = async (req, res) => {
    try {
        const clients = await userModel.getAllClients();
        res.json(clients);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const createClient = async (req, res) => {
    const { name, email, password, companyName, location } = req.body;
    if (!name || !email || !password || !companyName) {
        return res.status(400).json({ error: 'name, email, password, companyName required' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Create company
        const companyId = uuidv4();
        await conn.query(
            `INSERT INTO companies (id, name, location) VALUES (?, ?, ?)`,
            [companyId, companyName, location || null]
        );

        // Create user
        const userId = uuidv4();
        const hashed = await bcrypt.hash(password, 10);
        await conn.query(
            `INSERT INTO users (id, company_id, name, email, password, role) VALUES (?, ?, ?, ?, ?, 'client')`,
            [userId, companyId, name, email, hashed]
        );

        // Create default agent
        const agentId = uuidv4();
        const botInstructions = `### Agent Profile:\n- Name: ${companyName} Assistant\n- Tone: Friendly\n\nYou are ${companyName}'s AI assistant. Help visitors with their questions.`;
        await conn.query(
            `INSERT INTO agents (id, company_id, name, description, bot_instructions) VALUES (?, ?, ?, ?, ?)`,
            [agentId, companyId, `${companyName} Bot`, 'AI assistant', botInstructions]
        );

        // Create default widget
        const widgetId = uuidv4();
        await conn.query(
            `INSERT INTO agent_widgets (id, agent_id, company_id, initial_message, theme, main_color, main_text_color) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [widgetId, agentId, companyId, 'Hi! How can I help you?', 'light', '#2563eb', '#ffffff']
        );

        await conn.commit();

        res.json({
            client: { id: userId, name, email, companyId, companyName },
            agent: { id: agentId, name: `${companyName} Bot` },
            widget: { id: widgetId }
        });
    } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email or company name already exists' });
        }
        console.error('createClient error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
};

// ─── AGENTS ────────────────────────────────────────────────────

const getAgents = async (req, res) => {
    const companyId = req.user.role === 'super_admin' ? req.query.companyId : req.user.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query(`
            SELECT a.id, a.name, a.description, a.type, a.style, a.industry, a.model, a.temperature,
                   a.is_active AS isActive, a.created_at AS createdAt,
                   w.id AS widgetId
            FROM agents a
            LEFT JOIN agent_widgets w ON w.agent_id = a.id
            WHERE a.company_id = ?
            ORDER BY a.created_at DESC
        `, [companyId]);
        res.json(rows);
    } finally {
        conn.release();
    }
};

const getAgentDetail = async (req, res) => {
    const { agentId } = req.params;
    const conn = await pool.getConnection();
    try {
        const [agents] = await conn.query(`
            SELECT a.*, w.id AS widgetId, w.initial_message, w.theme, w.main_color, w.main_text_color,
                   w.send_bg_color, w.send_text_color, w.receive_bg_color, w.receive_text_color,
                   w.photo_url, w.chat_icon_url, w.height, w.width
            FROM agents a
            LEFT JOIN agent_widgets w ON w.agent_id = a.id
            WHERE a.id = ?
        `, [agentId]);

        if (!agents.length) return res.status(404).json({ error: 'Agent not found' });

        const agent = agents[0];

        // Check access
        if (req.user.role === 'client' && agent.company_id !== req.user.companyId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json(agent);
    } finally {
        conn.release();
    }
};

const createAgent = async (req, res) => {
    const companyId = req.user.role === 'super_admin' ? req.body.companyId : req.user.companyId;
    const { name, description, type, style, industry, botInstructions } = req.body;
    if (!companyId || !name) return res.status(400).json({ error: 'companyId and name required' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const agentId = uuidv4();
        await conn.query(
            `INSERT INTO agents (id, company_id, name, description, type, style, industry, bot_instructions)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [agentId, companyId, name, description || null, type || 'lead', style || 'friendly', industry || 'other', botInstructions || null]
        );

        const widgetId = uuidv4();
        await conn.query(
            `INSERT INTO agent_widgets (id, agent_id, company_id, theme, main_color, main_text_color)
             VALUES (?, ?, ?, 'light', '#2563eb', '#ffffff')`,
            [widgetId, agentId, companyId]
        );

        await conn.commit();
        res.json({ id: agentId, widgetId });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
};

const updateAgent = async (req, res) => {
    const { agentId } = req.params;
    const { name, description, type, style, industry, botInstructions, model, temperature } = req.body;

    const conn = await pool.getConnection();
    try {
        // Check ownership
        const [agents] = await conn.query('SELECT company_id FROM agents WHERE id = ?', [agentId]);
        if (!agents.length) return res.status(404).json({ error: 'Agent not found' });
        if (req.user.role === 'client' && agents[0].company_id !== req.user.companyId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const fields = [];
        const values = [];
        if (name !== undefined) { fields.push('name = ?'); values.push(name); }
        if (description !== undefined) { fields.push('description = ?'); values.push(description); }
        if (type !== undefined) { fields.push('type = ?'); values.push(type); }
        if (style !== undefined) { fields.push('style = ?'); values.push(style); }
        if (industry !== undefined) { fields.push('industry = ?'); values.push(industry); }
        if (botInstructions !== undefined) { fields.push('bot_instructions = ?'); values.push(botInstructions); }
        if (model !== undefined) { fields.push('model = ?'); values.push(model); }
        if (temperature !== undefined) { fields.push('temperature = ?'); values.push(temperature); }

        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

        values.push(agentId);
        await conn.query(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`, values);

        res.json({ success: true });
    } finally {
        conn.release();
    }
};

const updateWidget = async (req, res) => {
    const { widgetId } = req.params;
    const updates = req.body;

    const conn = await pool.getConnection();
    try {
        const fieldMap = {
            initialMessage: 'initial_message', theme: 'theme', mainColor: 'main_color',
            mainTextColor: 'main_text_color', sendBgColor: 'send_bg_color', sendTextColor: 'send_text_color',
            receiveBgColor: 'receive_bg_color', receiveTextColor: 'receive_text_color',
            photoUrl: 'photo_url', chatIconUrl: 'chat_icon_url', height: 'height',
            width: 'width', isPlainBackground: 'is_plain_background', chatBgColor: 'chat_bg_color'
        };

        const fields = [];
        const values = [];
        for (const [key, col] of Object.entries(fieldMap)) {
            if (updates[key] !== undefined) {
                fields.push(`${col} = ?`);
                values.push(updates[key]);
            }
        }

        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

        values.push(widgetId);
        await conn.query(`UPDATE agent_widgets SET ${fields.join(', ')} WHERE id = ?`, values);
        res.json({ success: true });
    } finally {
        conn.release();
    }
};

// ─── CHATS ─────────────────────────────────────────────────────

const getThreads = async (req, res) => {
    const companyId = req.user.role === 'super_admin' ? req.query.companyId : req.user.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query(`
            SELECT 
                t.id AS threadId, t.channel, t.is_active AS isActive, t.topic,
                t.created_at AS createdAt, t.updated_at AS updatedAt,
                c.id AS customerId, c.name AS customerName, c.email AS customerEmail, c.phone AS customerPhone,
                a.id AS agentId, a.name AS agentName,
                (SELECT content FROM chat_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS lastMessage,
                (SELECT role FROM chat_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS lastMessageRole,
                (SELECT created_at FROM chat_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS lastMessageAt,
                (SELECT COUNT(*) FROM chat_messages WHERE thread_id = t.id) AS messageCount
            FROM chat_threads t
            JOIN customers c ON t.customer_id = c.id
            JOIN agents a ON t.agent_id = a.id
            WHERE a.company_id = ?
            ORDER BY t.updated_at DESC
        `, [companyId]);
        res.json(rows);
    } finally {
        conn.release();
    }
};

const getThreadMessages = async (req, res) => {
    const { threadId } = req.params;
    const conn = await pool.getConnection();
    try {
        // Verify access
        const [threads] = await conn.query(`
            SELECT a.company_id FROM chat_threads t JOIN agents a ON t.agent_id = a.id WHERE t.id = ?
        `, [threadId]);
        if (!threads.length) return res.status(404).json({ error: 'Thread not found' });
        if (req.user.role === 'client' && threads[0].company_id !== req.user.companyId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const [messages] = await conn.query(`
            SELECT id, role, content, status, created_at AS createdAt
            FROM chat_messages WHERE thread_id = ?
            ORDER BY created_at ASC
        `, [threadId]);
        res.json(messages);
    } finally {
        conn.release();
    }
};

// ─── DASHBOARD STATS ───────────────────────────────────────────

const getDashboardStats = async (req, res) => {
    const companyId = req.user.role === 'super_admin' ? req.query.companyId : req.user.companyId;

    const conn = await pool.getConnection();
    try {
        if (req.user.role === 'super_admin' && !companyId) {
            // Global stats for super admin
            const [[{ totalClients }]] = await conn.query('SELECT COUNT(*) AS totalClients FROM users WHERE role = "client"');
            const [[{ totalAgents }]] = await conn.query('SELECT COUNT(*) AS totalAgents FROM agents');
            const [[{ totalThreads }]] = await conn.query('SELECT COUNT(*) AS totalThreads FROM chat_threads');
            const [[{ totalMessages }]] = await conn.query('SELECT COUNT(*) AS totalMessages FROM chat_messages');
            const [[{ activeThreads }]] = await conn.query('SELECT COUNT(*) AS activeThreads FROM chat_threads WHERE is_active = TRUE');

            return res.json({ totalClients, totalAgents, totalThreads, totalMessages, activeThreads });
        }

        if (!companyId) return res.status(400).json({ error: 'companyId required' });

        const [[{ totalAgents }]] = await conn.query('SELECT COUNT(*) AS totalAgents FROM agents WHERE company_id = ?', [companyId]);
        const [[{ totalThreads }]] = await conn.query(`
            SELECT COUNT(*) AS totalThreads FROM chat_threads t JOIN agents a ON t.agent_id = a.id WHERE a.company_id = ?
        `, [companyId]);
        const [[{ totalMessages }]] = await conn.query(`
            SELECT COUNT(*) AS totalMessages FROM chat_messages m 
            JOIN chat_threads t ON m.thread_id = t.id 
            JOIN agents a ON t.agent_id = a.id WHERE a.company_id = ?
        `, [companyId]);
        const [[{ activeThreads }]] = await conn.query(`
            SELECT COUNT(*) AS activeThreads FROM chat_threads t JOIN agents a ON t.agent_id = a.id 
            WHERE a.company_id = ? AND t.is_active = TRUE
        `, [companyId]);
        const [[{ totalCustomers }]] = await conn.query('SELECT COUNT(*) AS totalCustomers FROM customers WHERE company_id = ?', [companyId]);

        res.json({ totalAgents, totalThreads, totalMessages, activeThreads, totalCustomers });
    } finally {
        conn.release();
    }
};

// ─── COMPANIES (Super Admin) ──────────────────────────────────

const getAllCompanies = async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query(`
            SELECT c.id, c.name, c.location, c.created_at AS createdAt,
                   (SELECT COUNT(*) FROM agents WHERE company_id = c.id) AS agentCount,
                   (SELECT COUNT(*) FROM customers WHERE company_id = c.id) AS customerCount
            FROM companies c ORDER BY c.created_at DESC
        `);
        res.json(rows);
    } finally {
        conn.release();
    }
};

module.exports = {
    getAllClients, createClient,
    getAgents, getAgentDetail, createAgent, updateAgent, updateWidget,
    getThreads, getThreadMessages,
    getDashboardStats, getAllCompanies
};
