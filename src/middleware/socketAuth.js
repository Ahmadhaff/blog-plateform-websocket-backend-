const jwt = require('jsonwebtoken');

const socketAuth = async (socket, next) => {
  try {
    // Try to get token from auth object first (preferred method for Socket.IO clients)
    // Fallback to query parameter for testing with Postman or other WebSocket clients
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    socket.userId = decoded.userId;
    socket.username = decoded.username || 'User';

    socket.join(`user:${decoded.userId}`);

    return next();
  } catch (error) {
    return next(new Error('Invalid authentication token'));
  }
};

module.exports = socketAuth;
