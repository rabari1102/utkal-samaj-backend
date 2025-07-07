// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = (requiredRoles = []) => {
  return async (req, res, next) => {
    try {
      const token = req.header('Authorization')?.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      const user = await User.findById(decoded.id);

      if (!user || !user.isApproved || !user.isActive) {
        return res.status(401).json({ message: 'User not authorized' });
      }

      // If role restriction is applied
      if (requiredRoles.length && !requiredRoles.includes(user.role)) {
        return res.status(403).json({ message: 'Access denied: insufficient permissions' });
      }

      req.user = user;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Token is not valid' });
    }
  };
};

module.exports = { auth };
