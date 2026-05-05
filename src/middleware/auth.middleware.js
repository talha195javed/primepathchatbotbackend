const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

const requireSuperAdmin = (req, res, next) => {
    if (req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Super admin access required' });
    }
    next();
};

const requireClient = (req, res, next) => {
    if (req.user.role !== 'client' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
};

module.exports = { authenticate, authenticateToken: authenticate, requireSuperAdmin, requireClient };
