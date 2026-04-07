const customerService = require('../services/customer.service');
const { pool } = require('../config/db.config');
const chatModel = require('../models/chat.model');

const createCustomerThread = async (req, res) => {
    const { companyId, agentId, name, phone, email, code, location } = req.body;

    if (!companyId || !agentId) {
        return res.status(400).json({ error: 'Missing required field' });
    }

    try {
        // Always create a new customer for each visitor (no reuse)
        const customer = await customerService.createCustomer({ companyId, name, phone, email, code, location });

        const thread = await findOrCreateThread({
            customerId: customer.id,
            agentId,
            channel: 'web'
        });

        res.json({ threadId: thread.id, customerId: customer.id });
    } catch (err) {
        console.error('Error in createCustomerThread:', err);
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

const findOrCreateThread = async ({ customerId, agentId, channel }) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Always create a new thread for each visitor (no reuse)
        const threadId = await chatModel.createThread({ customerId, agentId, channel }, conn);
        await conn.commit();
        return { id: threadId };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

module.exports = { createCustomerThread };
