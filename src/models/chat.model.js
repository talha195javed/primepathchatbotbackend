const { pool } = require('../config/db.config');
const { v4: uuidv4 } = require('uuid');
const { toMySQLDateTime, fromMySQLDateTime } = require('../utils/utc-date');

const findActiveThread = async (customerId, channel, conn) => {
    const [rows] = await conn.query(
        `SELECT id, current_handler AS currentHandler, agent_id AS agentId
         FROM chat_threads
         WHERE customer_id = ? AND channel = ? AND is_active = TRUE
         ORDER BY created_at DESC
         LIMIT 1 FOR UPDATE`,
        [customerId, channel]
    );
    return rows.length ? rows[0] : null;
};

const createThread = async ({ customerId, agentId, channel }, conn) => {
    const threadId = uuidv4();
    await conn.query(
        `INSERT INTO chat_threads (id, customer_id, agent_id, channel) VALUES (?, ?, ?, ?)`,
        [threadId, customerId, agentId, channel]
    );
    return threadId;
};

const saveMessage = async ({ thread_id, role, content, agent_id = null, status = 'sent' }) => {
    const conn = await pool.getConnection();
    const msg_id = uuidv4();
    const createdAt = toMySQLDateTime(new Date().toISOString());

    try {
        await conn.query(
            `INSERT INTO chat_messages (id, thread_id, role, agent_id, content, created_at, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [msg_id, thread_id, role, agent_id, content, createdAt, status]
        );
        return msg_id;
    } catch (err) {
        console.error("Failed to insert message:", err);
        throw err;
    } finally {
        conn.release();
    }
};

const checkThreadExists = async (threadId) => {
    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query(
            `SELECT 1 FROM chat_threads WHERE id = ? AND is_active = TRUE LIMIT 1;`,
            [threadId]
        );
        return rows.length > 0;
    } finally {
        conn.release();
    }
};

const getChatHistory = async ({ threadId, limit, offset }) => {
    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query(
            `SELECT id, thread_id, role, content, status, created_at
             FROM chat_messages
             WHERE thread_id = ?
             ORDER BY created_at DESC 
             LIMIT ? OFFSET ?`,
            [threadId, limit, offset]
        );

        return rows.map(row => ({
            id: row.id,
            threadId: row.thread_id,
            role: row.role,
            content: row.content,
            status: row.status,
            createdAt: row.created_at ? fromMySQLDateTime(row.created_at) : null
        }));
    } finally {
        conn.release();
    }
};

const getThreadById = async ({ threadId }) => {
    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query(
            `SELECT 
                ct.id AS id,
                ct.agent_id AS agentId,
                ct.customer_id AS customerId,
                ct.channel AS channel,
                ct.current_handler AS currentHandler,
                ct.is_active AS isActive,
                c.name AS customerName,
                c.phone AS customerPhone,
                c.location AS customerLocation,
                a.company_id AS companyId
             FROM chat_threads ct
             JOIN customers c ON ct.customer_id = c.id
             JOIN agents a ON ct.agent_id = a.id
             WHERE ct.id = ?`,
            [threadId]
        );
        return rows[0] || null;
    } finally {
        conn.release();
    }
};

const getThreadHandlerData = async (threadId) => {
    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query(
            `SELECT current_handler, agent_id FROM chat_threads WHERE id = ? LIMIT 1`,
            [threadId]
        );
        if (!rows.length) throw new Error(`Thread not found: ${threadId}`);
        return { agent_id: rows[0].agent_id, assistant_id: null };
    } catch (err) {
        console.error("Error fetching thread handler data:", err);
        throw err;
    } finally {
        conn.release();
    }
};

const reactivateThread = async (threadId) => {
    const conn = await pool.getConnection();
    try {
        await conn.query(
            `UPDATE chat_threads SET is_active = 1, closed_at = NULL WHERE id = ?`,
            [threadId]
        );
    } finally {
        conn.release();
    }
};

module.exports = {
    findActiveThread,
    createThread,
    saveMessage,
    checkThreadExists,
    getChatHistory,
    getThreadById,
    getThreadHandlerData,
    reactivateThread
};
