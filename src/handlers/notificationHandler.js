const notificationService = require('../services/notificationService');
const Notification = require('../models/Notification');

const notificationHandler = (socket, io) => {
  // Fetch notifications
  socket.on('notifications:fetch', async () => {
    try {
      const notifications = await notificationService.getUnreadNotifications(socket.userId);
      socket.emit('notifications:list', notifications);
    } catch (error) {
      console.error('❌ Error fetching notifications:', error);
    }
  });

  // Mark notifications as read
  socket.on('notifications:markRead', async (ids = []) => {
    try {
      if (!Array.isArray(ids) || !ids.length) {
        return;
      }

      await notificationService.markAsRead(ids);
      
      // Update notification count and emit to user
      // Query directly using collection to match platform-server schema (uses 'read' and 'user' fields)
      const mongoose = require('mongoose');
      const NotificationCollection = mongoose.connection.collection('notifications');
      const unreadCount = await NotificationCollection.countDocuments({
        user: new mongoose.Types.ObjectId(socket.userId),
        read: false
      });

      io.to(`user:${socket.userId}`).emit('notifications:read', ids);
      io.to(`user:${socket.userId}`).emit('notificationCount', { count: unreadCount });
    } catch (error) {
      console.error('❌ Error marking notifications as read:', error);
    }
  });

  // Mark single notification as read
  socket.on('notification:markRead', async (notificationId) => {
    try {
      if (!notificationId) {
        return;
      }

      // Query directly using collection to match platform-server schema
      const mongoose = require('mongoose');
      const NotificationCollection = mongoose.connection.collection('notifications');
      const notification = await NotificationCollection.findOne({
        _id: new mongoose.Types.ObjectId(notificationId),
        user: new mongoose.Types.ObjectId(socket.userId)
      });

      if (!notification) {
        return;
      }

      if (!notification.read) {
        await NotificationCollection.updateOne(
          { _id: new mongoose.Types.ObjectId(notificationId) },
          { 
            $set: { 
              read: true,
              readAt: new Date()
            }
          }
        );
      }

      // Update notification count and emit to user
      const unreadCount = await NotificationCollection.countDocuments({
        user: new mongoose.Types.ObjectId(socket.userId),
        read: false
      });

      io.to(`user:${socket.userId}`).emit('notification:read', {
        notificationId,
        articleId: notification.data?.articleId || null
      });
      io.to(`user:${socket.userId}`).emit('notificationCount', { count: unreadCount });
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
    }
  });

  // Get unread count
  socket.on('notification:getCount', async () => {
    try {
      const mongoose = require('mongoose');
      const NotificationCollection = mongoose.connection.collection('notifications');
      const unreadCount = await NotificationCollection.countDocuments({
        user: new mongoose.Types.ObjectId(socket.userId),
        read: false
      });
      
      socket.emit('notificationCount', { count: unreadCount });
    } catch (error) {
      console.error('❌ [NotificationHandler] Error getting notification count:', error);
    }
  });
};

module.exports = notificationHandler;
