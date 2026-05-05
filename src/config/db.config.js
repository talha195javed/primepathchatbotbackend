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
                stripe_customer_id VARCHAR(255),
                routing_strategy ENUM('round_robin', 'least_busy', 'skill_based', 'availability_based') DEFAULT 'round_robin',
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
                photo_url VARCHAR(512) DEFAULT NULL,
                chat_icon_url VARCHAR(512) DEFAULT NULL,
                skills JSON DEFAULT NULL,
                max_conversations INT DEFAULT 5,
                current_load INT DEFAULT 0,
                priority INT DEFAULT 1,
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
                agent_id VARCHAR(36) DEFAULT NULL,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('super_admin', 'client') DEFAULT 'client',
                is_online BOOLEAN DEFAULT FALSE,
                last_seen_at TIMESTAMP NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
                updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
            );
        `);

        // Routing logs table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS routing_logs (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL,
                agent_id VARCHAR(36) NOT NULL,
                strategy ENUM('round_robin', 'least_busy', 'skill_based', 'availability_based') DEFAULT 'round_robin',
                conversation_data JSON,
                created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
                INDEX idx_company_strategy (company_id, strategy),
                INDEX idx_created_at (created_at)
            );
        `);

        // WhatsApp configurations table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS whatsapp_configs (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL,
                phone_number_id VARCHAR(100) NOT NULL,
                access_token TEXT NOT NULL,
                webhook_verify_token VARCHAR(255) NOT NULL,
                phone_number VARCHAR(20) NOT NULL,
                business_account_id VARCHAR(100),
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
                updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
                INDEX idx_company_id (company_id)
            );
        `);

        // Meetings table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS meetings (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL,
                customer_id VARCHAR(36) NOT NULL,
                agent_id VARCHAR(36) NOT NULL,
                thread_id VARCHAR(36),
                title VARCHAR(255) NOT NULL,
                description TEXT,
                google_calendar_event_id VARCHAR(255),
                google_meet_link VARCHAR(512),
                start_time TIMESTAMP NOT NULL,
                end_time TIMESTAMP NOT NULL,
                status ENUM('scheduled', 'confirmed', 'completed', 'cancelled') DEFAULT 'scheduled',
                reminder_sent_24h BOOLEAN DEFAULT FALSE,
                reminder_sent_1h BOOLEAN DEFAULT FALSE,
                reminder_sent_10m BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
                updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
                FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE SET NULL,
                INDEX idx_start_time (start_time),
                INDEX idx_status (status)
            );
        `);

        // Google Calendar configurations table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS google_calendar_configs (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL,
                agent_id VARCHAR(36),
                access_token TEXT NOT NULL,
                refresh_token TEXT NOT NULL,
                calendar_id VARCHAR(255) DEFAULT 'primary',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
                updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
                INDEX idx_company_id (company_id)
            );
        `);

        // Subscriptions table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS subscriptions (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL,
                stripe_subscription_id VARCHAR(255),
                stripe_customer_id VARCHAR(255),
                plan ENUM('starter', 'pro', 'enterprise') DEFAULT 'starter',
                status ENUM('active', 'trialing', 'past_due', 'canceled', 'unpaid') DEFAULT 'trialing',
                current_period_start TIMESTAMP,
                current_period_end TIMESTAMP,
                cancel_at_period_end BOOLEAN DEFAULT FALSE,
                max_agents INT DEFAULT 1,
                max_messages_per_month INT DEFAULT 1000,
                created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
                updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
                INDEX idx_stripe_subscription_id (stripe_subscription_id),
                INDEX idx_status (status)
            );
        `);

        // Leads table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS leads (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL,
                customer_id VARCHAR(36) NOT NULL,
                thread_id VARCHAR(36),
                source ENUM('website', 'whatsapp', 'referral') DEFAULT 'website',
                status ENUM('new', 'contacted', 'qualified', 'converted', 'lost') DEFAULT 'new',
                score INT DEFAULT 0,
                score_factors JSON,
                score_updated_at TIMESTAMP NULL,
                tags JSON,
                notes TEXT,
                assigned_agent_id VARCHAR(36),
                last_contacted_at TIMESTAMP,
                last_follow_up_sent_at TIMESTAMP NULL,
                inactive_reminder_sent_at TIMESTAMP NULL,
                created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
                updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
                FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE SET NULL,
                FOREIGN KEY (assigned_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
                INDEX idx_status (status),
                INDEX idx_score (score),
                INDEX idx_source (source)
            );
        `);

        // Custom reminders table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS custom_reminders (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL,
                user_id VARCHAR(36) NOT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                scheduled_for TIMESTAMP NOT NULL,
                reminder_type ENUM('general', 'whatsapp', 'email') DEFAULT 'general',
                is_sent BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
                updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_scheduled_for (scheduled_for),
                INDEX idx_is_sent (is_sent)
            );
        `);

        // Company templates table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS company_templates (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL,
                template_id VARCHAR(50) NOT NULL,
                agent_id VARCHAR(36) NOT NULL,
                widget_id VARCHAR(36),
                customizations JSON,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
                updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
                FOREIGN KEY (widget_id) REFERENCES agent_widgets(id) ON DELETE SET NULL,
                INDEX idx_company_template (company_id, template_id)
            );
        `);

        console.log('Database tables initialized successfully');
    } finally {
        conn.release();
    }
};

module.exports = { initDB, pool };
