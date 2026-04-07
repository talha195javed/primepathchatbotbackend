const { pool } = require('../config/db.config');

const findCustomerByPhone = async ({ phone, companyId }) => {
    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query(
            `SELECT id, name, phone, email, location, code
             FROM customers 
             WHERE phone = ? AND company_id = ? AND is_active = TRUE`,
            [phone, companyId]
        );
        return rows[0] || null;
    } finally {
        conn.release();
    }
};

const insertCustomer = async (customer) => {
    const conn = await pool.getConnection();
    try {
        await conn.query(
            `INSERT INTO customers (id, name, phone, email, company_id, location, code)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [customer.id, customer.name, customer.phone, customer.email,
             customer.companyId, customer.location, customer.code]
        );
        return customer;
    } catch (err) {
        console.error('Error inserting customer:', err);
        throw new Error('Failed to insert customer');
    } finally {
        conn.release();
    }
};

module.exports = {
    findCustomerByPhone,
    insertCustomer
};
