const jwt = require('jsonwebtoken');

const socketAuth = async (socket, next) => {
  try {
    // Try to get token from auth object first (preferred method for Socket.IO clients)
    // Fallback to query parameter for testing with Postman or other WebSocket clients
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      console.error('❌ [socketAuth] Missing token in handshake');
      return next(new Error('Authentication token required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Be tolerant to different payload keys
    const userId =
      decoded.userId ||
      decoded.id ||
      decoded._id ||
      decoded.sub;

    if (!userId) {
      console.error('❌ [socketAuth] Token payload missing user id', decoded);
      return next(new Error('Invalid authentication token'));
    }

    socket.userId = String(userId);
    socket.username = decoded.username || 'User';

    // Join a dedicated room for this user
    const roomName = `user:${socket.userId}`;
    socket.join(roomName);

    console.log('✅ [socketAuth] Socket connected', {
      socketId: socket.id,
      userId: socket.userId,
      username: socket.username,
      room: roomName
    });

    return next();
  } catch (error) {
    console.error('❌ [socketAuth] Error verifying token', error);
    return next(new Error('Invalid authentication token'));
  }
};

module.exports = socketAuth;
