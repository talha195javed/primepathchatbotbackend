// Database configuration and schema initialization
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

const initDB = async () => {
    const conn = await pool.getConnection();
    try {
        // Companies table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS companies (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                location VARCHAR(255),
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
                updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
            );
        `);

        // Files table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS files (
                id VARCHAR(36) PRIMARY KEY,
                filename VARCHAR(255) NOT NULL,
                path VARCHAR(512) NOT NULL,
                content_hash VARCHAR(64) UNIQUE,
                size BIGINT,
                mime_type VARCHAR(128) DEFAULT NULL,
                created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3)
            );
        `);

        // Agents table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS agents (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL,
                name VARCHAR(36) NOT NULL,
                description VARCHAR(128) DEFAULT NULL,
                type ENUM('follow', 'quote', 'lead') DEFAULT 'lead',
                style ENUM('friendly', 'professional', 'sales-pushing') DEFAULT 'friendly',
                industry ENUM('technology', 'healthcare', 'finance', 'e-commerce', 'real-estate',
                    'education', 'manufacturing', 'consulting', 'marketing', 'other') DEFAULT 'other',
                bot_instructions LONGTEXT DEFAULT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                temperature DECIMAL(2, 1) DEFAULT 0.7 CHECK (temperature >= 0.0 AND temperature <= 1.0),
                model VARCHAR(128) DEFAULT 'deepseek-chat',
                created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
                updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            );
        `);

        // Agent files table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS agent_files (
                id VARCHAR(36) PRIMARY KEY,
                agent_id VARCHAR(36) NOT NULL,
                file_id VARCHAR(36) NOT NULL,
                is_existing BOOLEAN DEFAULT TRUE,
                extracted_data LONGTEXT DEFAULT NULL,
                created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
                updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
            );
        `);

        // Agent file chunks (for RAG embeddings)
        await conn.query(`
            CREATE TABLE IF NOT EXISTS agent_file_chunks (
                id VARCHAR(36) PRIMARY KEY,
                file_id VARCHAR(36) NOT NULL,
                chunk_text TEXT NOT NULL,
                embedding JSON NOT NULL,
                order_index SMALLINT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
            );
        `);

        // Agent widgets table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS agent_widgets (
                id VARCHAR(36) PRIMARY KEY,
                agent_id VARCHAR(36) NOT NULL,
                company_id VARCHAR(36) NOT NULL,
                photo_url VARCHAR(512) DEFAULT NULL,
                chat_icon_url VARCHAR(512) DEFAULT NULL,
                initial_message VARCHAR(128) DEFAULT 'Hi there, how can I help you today?',
                theme ENUM('dark', 'light') DEFAULT 'dark',
                send_bg_color VARCHAR(7) DEFAULT NULL,
                send_text_color VARCHAR(7) DEFAULT NULL,
                receive_bg_color VARCHAR(7) DEFAULT NULL,
                receive_text_color VARCHAR(7) DEFAULT NULL,
                height VARCHAR(16) DEFAULT '70%',
                width VARCHAR(16) DEFAULT '400px',
                z_index INT DEFAULT 9999,
                is_left_icon BOOLEAN DEFAULT FALSE,
                main_color VARCHAR(7) DEFAULT NULL,
                main_text_color VARCHAR(7) DEFAULT NULL,
                is_plain_background BOOLEAN DEFAULT FALSE,
                chat_bg_color VARCHAR(7) DEFAULT NULL,
                created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
                updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
            );
        `);

        // Customers table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL,
                name TEXT,
                code VARCHAR(5),
                phone TEXT,
                email TEXT,
                location TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
                updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            );
        `);

        // Chat threads table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS chat_threads (
                id VARCHAR(36) PRIMARY KEY,
                agent_id VARCHAR(36) NOT NULL,
                customer_id VARCHAR(36) NOT NULL,
                channel ENUM('web') DEFAULT 'web',
                current_handler ENUM('agent', 'assistant') DEFAULT 'agent',
                topic VARCHAR(128) DEFAULT NULL,
                summary TEXT DEFAULT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
                updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                closed_at TIMESTAMP(3),
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
            );
        `);

        // Chat messages table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id VARCHAR(36) NOT NULL,
                thread_id VARCHAR(36) NOT NULL,
                role ENUM('customer','team') NOT NULL,
                agent_id VARCHAR(36) DEFAULT NULL,
                content TEXT NOT NULL,
                status ENUM('sent', 'delivered', 'read') DEFAULT 'sent',
                created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
                updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
                INDEX idx_thread_id (thread_id),
                INDEX idx_created_at (created_at)
            );
        `);

        // Users table (clients + super admins)
        await conn.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) DEFAULT NULL,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('super_admin', 'client') DEFAULT 'client',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
                updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            );
        `);

        console.log('Database tables initialized successfully');
    } finally {
        conn.release();
    }
};

module.exports = { initDB, pool };
