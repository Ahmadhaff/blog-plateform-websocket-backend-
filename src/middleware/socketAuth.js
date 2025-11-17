const jwt = require('jsonwebtoken');

const socketAuth = async (socket, next) => {
  try {
    // Try to get token from auth object first (preferred method for Socket.IO clients)
    // Fallback to query parameter for testing with Postman or other WebSocket clients
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      console.error('❌ [socketAuth] Missing token in handshake');
      console.error('❌ [socketAuth] Handshake auth:', socket.handshake.auth);
      console.error('❌ [socketAuth] Handshake query:', socket.handshake.query);
      return next(new Error('Authentication token required'));
    }

    let decoded;
    let usedAdminSecret = false;
    try {
      // Try with platform-server's JWT_SECRET first
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('✅ [socketAuth] Token verified with JWT_SECRET');
    } catch (error) {
      // If verification fails, try with admin-panel-server's JWT_SECRET (if provided)
      // This allows admin tokens to work with WebSocket server
      if (process.env.ADMIN_JWT_SECRET && (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError')) {
        try {
          decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
          usedAdminSecret = true;
          console.log('✅ [socketAuth] Token verified with ADMIN_JWT_SECRET');
        } catch (adminError) {
          console.error('❌ [socketAuth] Token verification failed with both secrets');
          console.error('❌ [socketAuth] JWT_SECRET error:', error.name, error.message);
          console.error('❌ [socketAuth] ADMIN_JWT_SECRET error:', adminError.name, adminError.message);
          return next(new Error('Invalid authentication token'));
        }
      } else {
        if (error.name === 'TokenExpiredError') {
          console.error('❌ [socketAuth] Token expired');
          return next(new Error('Token expired'));
        }
        if (error.name === 'JsonWebTokenError') {
          console.error('❌ [socketAuth] Invalid token format');
          return next(new Error('Invalid token'));
        }
        console.error('❌ [socketAuth] Error verifying token:', error);
        return next(new Error('Invalid authentication token'));
      }
    }

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
      room: roomName,
      usedAdminSecret: usedAdminSecret
    });

    return next();
  } catch (error) {
    console.error('❌ [socketAuth] Error verifying token', error);
    return next(new Error('Invalid authentication token'));
  }
};

module.exports = socketAuth;
