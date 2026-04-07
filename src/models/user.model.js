const { pool } = require('../config/db.config');

const findByEmail = async (email) => {
    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query(
            `SELECT id, company_id AS companyId, name, email, password, role, is_active AS isActive
             FROM users WHERE email = ? LIMIT 1`,
            [email]
        );
        return rows[0] || null;
    } finally {
        conn.release();
    }
};

const findById = async (id) => {
    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query(
            `SELECT id, company_id AS companyId, name, email, role, is_active AS isActive
             FROM users WHERE id = ? LIMIT 1`,
            [id]
        );
        return rows[0] || null;
    } finally {
        conn.release();
    }
};

const createUser = async ({ id, companyId, name, email, password, role }) => {
    const conn = await pool.getConnection();
    try {
        await conn.query(
            `INSERT INTO users (id, company_id, name, email, password, role) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, companyId, name, email, password, role]
        );
        return { id, companyId, name, email, role };
    } finally {
        conn.release();
    }
};

const getAllClients = async () => {
    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query(`
            SELECT u.id, u.name, u.email, u.role, u.is_active AS isActive, u.created_at AS createdAt,
                   c.id AS companyId, c.name AS companyName
            FROM users u
            LEFT JOIN companies c ON u.company_id = c.id
            WHERE u.role = 'client'
            ORDER BY u.created_at DESC
        `);
        return rows;
    } finally {
        conn.release();
    }
};

module.exports = { findByEmail, findById, createUser, getAllClients };
