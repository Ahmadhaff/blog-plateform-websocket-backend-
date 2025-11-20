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

// Create HTTP server
const server = http.createServer();

// Health check endpoint
server.on('request', (req, res) => {
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

  // Socket.IO handles /socket.io/* paths
  if (!req.url.startsWith('/socket.io/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// CORS configuration
const allowedOrigins = [
  'http://localhost:4200',
  'http://localhost:4201',
  'https://blogplateform.netlify.app',
  'https://adminpanelblogapp.netlify.app',
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
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type']
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
});

io.use(socketAuth);

io.on('connection', async (socket) => {
  try {
    const redis = getRedisClient();
    await redis.sAdd('online-users', socket.userId.toString());

    // Initialize handlers
    commentHandler(socket, io);
    notificationHandler(socket, io);
    typingHandler(socket, io);
    articleHandler(socket, io);

    // Send initial notification count
    setTimeout(async () => {
      try {
        const NotificationCollection = mongoose.connection.collection('notifications');
        const unreadCount = await NotificationCollection.countDocuments({
          user: new mongoose.Types.ObjectId(socket.userId),
          read: false
        });
        socket.emit('notificationCount', { count: unreadCount });
      } catch (error) {
        console.error('❌ Error sending initial notification count:', error);
      }
    }, 200);

    // Handle explicit disconnect event from client
    socket.on('userDisconnect', async (data) => {
      try {
        await redis.sRem('online-users', socket.userId.toString());
        console.log(`👋 User ${socket.username || socket.userId} disconnected`);
      } catch (error) {
        console.error('❌ Error handling user disconnect:', error);
      }
    });

    // Handle socket disconnect
    socket.on('disconnect', async () => {
      await redis.sRem('online-users', socket.userId.toString());
    });
  } catch (error) {
    console.error('❌ Connection error:', error);
  }
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
