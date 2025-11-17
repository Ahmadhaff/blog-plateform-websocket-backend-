const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
require('dotenv').config();

const { connectRedis, getRedisClient } = require('./config/redis');
const { connectRabbitMQ } = require('./config/rabbitmq');
const socketAuth = require('./middleware/socketAuth');
const EventConsumer = require('./services/eventConsumer');
const commentHandler = require('./handlers/commentHandler');
const notificationHandler = require('./handlers/notificationHandler');
const typingHandler = require('./handlers/typingHandler');
const articleHandler = require('./handlers/articleHandler');

// Create server without handler - let Socket.IO handle requests
const server = http.createServer();

// Add health check endpoint as a request listener (runs before Socket.IO)
server.on('request', (req, res) => {
  // Health check endpoint for Render.com and monitoring
  // This prevents Render.com from marking the service as inactive
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'OK',
      service: 'websocket-server',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }));
    return;
  }

  // For non-Socket.IO paths, return 404
  // Socket.IO will handle /socket.io/* paths - don't interfere
  if (!req.url.startsWith('/socket.io/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  
  // For Socket.IO paths, we need to let Socket.IO handle them
  // Socket.IO attaches its own listener, so it will process this request
  // We don't end the response here - Socket.IO will handle it
});

// Configure CORS for WebSocket
const allowedOrigins = [
  'http://localhost:4200',  // Main frontend (dev)
  'http://localhost:4201',  // Admin panel frontend (dev)
  'https://blogplateform.netlify.app',  // Main frontend (production)
  'https://adminpanelblogapp.netlify.app',  // Admin panel frontend (production)
  process.env.CLIENT_URL,
  ...(process.env.CLIENT_URLS ? process.env.CLIENT_URLS.split(',') : [])
].filter(Boolean);

const io = socketIO(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.log(`❌ WebSocket CORS: Blocked origin: ${origin}`);
      console.log(`✅ Allowed origins:`, allowedOrigins);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type']
  },
  // Better compatibility with Render.com and proxies
  transports: ['polling', 'websocket'], // Polling first for better proxy compatibility
  allowEIO3: true, // Allow Engine.IO v3 clients
  pingTimeout: 60000, // 60 seconds (longer for production)
  pingInterval: 25000, // 25 seconds
  upgradeTimeout: 30000, // 30 seconds for upgrade to websocket
  // Handle connection state properly
  connectionStateRecovery: {
    // Enable connection state recovery
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true
  }
});

io.use(socketAuth);

io.on('connection', async (socket) => {
  const redis = getRedisClient();
  await redis.sAdd('online-users', socket.userId.toString());

  commentHandler(socket, io);
  notificationHandler(socket, io);
  typingHandler(socket, io);
  articleHandler(socket, io);

  // Join user's personal room for notifications
  socket.emit('joinUserRoom');
  socket.join(`user:${socket.userId}`);

  // Get initial notification count when user connects
  setTimeout(async () => {
    try {
      const mongoose = require('mongoose');
      const NotificationCollection = mongoose.connection.collection('notifications');
      const unreadCount = await NotificationCollection.countDocuments({
        user: new mongoose.Types.ObjectId(socket.userId),
        read: false
      });
      socket.emit('notificationCount', { count: unreadCount });
    } catch (error) {
      console.error(`❌ [WebSocketServer] Error sending initial notification count:`, error);
    }
  }, 200);

  socket.on('disconnect', async () => {
    await redis.sRem('online-users', socket.userId.toString());
  });
});

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');

    await connectRedis();
    await connectRabbitMQ();

    const eventConsumer = new EventConsumer(io);
    await eventConsumer.startConsuming();

    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      console.log(`🚀 WebSocket Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { io, server };
