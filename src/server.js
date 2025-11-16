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

const server = http.createServer();

const io = socketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true
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
