const jwt = require('jsonwebtoken');

const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    // Verify token with JWT_SECRET
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Extract user ID from token
    const userId = decoded.userId || decoded.id || decoded._id || decoded.sub;

    if (!userId) {
      return next(new Error('Invalid token payload'));
    }

    // Attach user info to socket
    socket.userId = String(userId);
    socket.username = decoded.username || decoded.name || 'User';

    // Join user's personal room
    socket.join(`user:${socket.userId}`);

    console.log(`✅ [socketAuth] Socket connected - User: ${socket.username} (${socket.userId})`);

    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new Error('Token expired'));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(new Error('Invalid token'));
    }
    console.error('❌ [socketAuth] Error:', error.message);
    return next(new Error('Authentication failed'));
  }
};

module.exports = socketAuth;
