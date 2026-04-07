const { pool } = require('../config/db.config');

const getWidgetById = async (widgetId) => {
    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query(`
            SELECT 
                w.id AS widgetId,
                w.company_id AS companyId,
                w.agent_id AS agentId,
                a.name,
                a.description,
                w.photo_url AS photoUrl,
                w.chat_icon_url AS chatIconUrl,
                w.initial_message AS initialMessage,
                w.theme,
                w.send_bg_color AS sendBgColor,
                w.send_text_color AS sendTextColor,
                w.receive_bg_color AS receiveBgColor,
                w.receive_text_color AS receiveTextColor,
                w.height,
                w.width,
                w.z_index AS zIndex,
                w.is_left_icon AS isLeftIcon,
                w.main_color AS mainColor,
                w.main_text_color AS mainTextColor,
                w.is_plain_background AS isPlainBackground,
                w.chat_bg_color AS chatBgColor
            FROM agent_widgets w
            JOIN agents a ON a.id = w.agent_id
            WHERE w.id = ?;
        `, [widgetId]);

        return rows[0] || null;
    } catch (error) {
        console.error('Error fetching widget by ID:', error);
        throw error;
    } finally {
        conn.release();
    }
};

const getAgentInstructionsById = async (agentId) => {
    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query(
            `SELECT bot_instructions, temperature, model FROM agents WHERE id = ?`,
            [agentId]
        );
        return rows[0] || null;
    } finally {
        conn.release();
    }
};

const getChunksByAgentId = async (agentId) => {
    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query(`
            SELECT afc.chunk_text, afc.embedding, afc.file_id, afc.order_index
            FROM agent_file_chunks afc
            JOIN agent_files af ON af.file_id = afc.file_id
            WHERE af.agent_id = ?
        `, [agentId]);
        return rows;
    } finally {
        conn.release();
    }
};

const getNeighborChunks = async (fileId, orderIndex) => {
    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query(`
            SELECT chunk_text, embedding
            FROM agent_file_chunks
            WHERE file_id = ? AND order_index BETWEEN ? AND ?
            ORDER BY order_index
        `, [fileId, Math.max(0, orderIndex - 1), orderIndex + 1]);
        return rows;
    } finally {
        conn.release();
    }
};

module.exports = {
    getWidgetById,
    getAgentInstructionsById,
    getChunksByAgentId,
    getNeighborChunks
};
