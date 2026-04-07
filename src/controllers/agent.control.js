const agentService = require('../services/agent.service');

const getWidgetById = async (req, res) => {
    try {
        const { widgetId } = req.query;
        if (!widgetId) {
            return res.status(400).json({ error: 'widgetId required' });
        }
        const data = await agentService.getWidgetById(widgetId);
        res.status(200).json(data);
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

module.exports = { getWidgetById };
