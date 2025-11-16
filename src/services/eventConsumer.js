const { getRabbitChannel } = require('../config/rabbitmq');
const { getRedisClient } = require('../config/redis');
const Notification = require('../models/Notification');
const Comment = require('../models/Comment');

class EventConsumer {
  constructor(io) {
    this.io = io;
    // Track processed notifications to prevent duplicates
    this.processedNotifications = new Set();
  }

  async startConsuming() {
    await this.consumeRabbitMQ();
    await this.subscribeRedis();
  }

  async consumeRabbitMQ() {
    const channel = getRabbitChannel();

    const { queue } = await channel.assertQueue('websocket-events', {
      durable: true
    });

    await channel.bindQueue(queue, 'blog-events', 'article.*');
    await channel.bindQueue(queue, 'blog-events', 'comment.*');
    await channel.bindQueue(queue, 'blog-events', 'notification.*');

    channel.consume(queue, async (msg) => {
      if (msg) {
        const event = JSON.parse(msg.content.toString());
        await this.handleEvent(event);
        channel.ack(msg);
      }
    });
  }

  async subscribeRedis() {
    const redis = getRedisClient();
    const subscriber = redis.duplicate();
    await subscriber.connect();

    await subscriber.subscribe('article-events', (message) => {
      const event = JSON.parse(message);
      this.handleEvent(event);
    });

    await subscriber.subscribe('comment-events', (message) => {
      const event = JSON.parse(message);
      this.handleEvent(event);
    });

    await subscriber.subscribe('notification-events', (message) => {
      const event = JSON.parse(message);
      this.handleEvent(event);
    });

  }

  async handleEvent(event) {
    switch (event.type) {
      case 'article.created':
        this.handleArticleCreated(event);
        break;
      case 'article.liked':
        await this.handleArticleLiked(event);
        break;
      case 'comment.created':
        await this.handleCommentCreated(event);
        break;
      case 'comment.updated':
        await this.handleCommentUpdated(event);
        break;
      case 'comment.deleted':
        await this.handleCommentDeleted(event);
        break;
      case 'comment.liked':
        await this.handleCommentLiked(event);
        break;
      case 'notification':
      case 'notification.new':
      case 'new_article':
      case 'new_comment':
      case 'comment_reply':
      case 'article_liked':
      case 'comment_liked':
        await this.handleNotification(event);
        break;
      case 'notification_read':
      case 'notification_read_all':
        await this.handleNotificationRead(event);
        break;
      default:
        break;
    }
  }

  handleArticleCreated(event) {
    this.io.emit('newArticle', {
      articleId: event.articleId,
      title: event.title,
      authorId: event.authorId
    });
  }

  async handleArticleLiked(event) {
    try {
      // Emit the like update to ALL connected users (for real-time updates on home page and detail page)
      this.io.emit('articleLiked', {
        articleId: event.articleId,
        likes: event.likes,
        likesArray: event.likesArray || [], // Full array for frontend to check if user liked
        isLiked: event.isLiked,
        userId: event.userId
      });

      console.log(`❤️ Article like broadcast to ALL users - article ${event.articleId} ${event.isLiked ? 'liked' : 'unliked'} by user ${event.userId}`);
    } catch (error) {
      console.error('❌ Error handling article liked event:', error);
    }
  }

  async handleCommentCreated(event) {
    try {
      // Load the full comment from MongoDB with populated author
      const commentDoc = await Comment.findById(event.commentId)
        .populate('author', 'username avatar role')
        .lean();

      if (!commentDoc) {
        console.error('❌ Comment not found:', event.commentId);
        return;
      }

      // Get base URL for avatar construction
      const baseUrl = process.env.APP_BASE_URL 
        ? process.env.APP_BASE_URL.replace(/\/$/, '')
        : 'http://localhost:3000';
      
      // Format comment to match frontend Comment interface
      const comment = {
        _id: commentDoc._id.toString(),
        content: commentDoc.content,
        author: {
          _id: commentDoc.author._id.toString(),
          username: commentDoc.author.username,
          // Construct full avatar URL if avatar fileId exists
          avatar: commentDoc.author.avatar
            ? `${baseUrl}/api/users/${commentDoc.author._id}/avatar?t=${Date.now()}`
            : null,
          role: commentDoc.author.role || null
        },
        article: commentDoc.article.toString(),
        parentComment: commentDoc.parentComment ? commentDoc.parentComment.toString() : null,
        likes: commentDoc.likes ? commentDoc.likes.map(like => like.toString()) : [],
        isDeleted: commentDoc.isDeleted || false,
        createdAt: commentDoc.createdAt ? commentDoc.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: commentDoc.updatedAt ? commentDoc.updatedAt.toISOString() : new Date().toISOString(),
        replies: [] // Replies will be populated when fetched separately if needed
      };

      // Emit the formatted comment to the article room
      // Also emit to the user who created it (they might not be in the room yet)
      this.io.to(`article:${event.articleId}`).emit('newComment', {
        comment: comment,
        parentCommentId: event.parentCommentId || null
      });

      // Also send directly to the author to ensure they see their comment
      // This ensures real-time feedback for the comment creator
      this.io.to(`user:${event.authorId}`).emit('newComment', {
        comment: comment,
        parentCommentId: event.parentCommentId || null
      });

      console.log(`📨 Comment broadcast to article room ${event.articleId} by ${commentDoc.author.username}`);

      // Create notification for article author (if not the same as comment author)
      if (event.articleAuthorId && event.articleAuthorId.toString() !== event.authorId.toString()) {
        const notification = new Notification({
          type: 'new_comment',
          message: `${comment.author.username} commented on your article`,
          recipient: event.articleAuthorId,
          sender: event.authorId,
          articleId: event.articleId,
          commentId: event.commentId
        });

        await notification.save();

        // Emit notification to the article author's personal room
        this.io.to(`user:${event.articleAuthorId}`).emit('notification', {
          type: 'new_comment',
          message: `${comment.author.username} commented on your article`,
          articleId: event.articleId,
          commentId: event.commentId
        });
      }
    } catch (error) {
      console.error('❌ Error handling comment created event:', error);
    }
  }

  async handleCommentLiked(event) {
    try {
      // Load the comment to get updated likes array
      const commentDoc = await Comment.findById(event.commentId)
        .populate('author', 'username avatar role')
        .lean();

      if (!commentDoc) {
        console.error('❌ Comment not found:', event.commentId);
        return;
      }

      // Get base URL for avatar construction
      const baseUrl = process.env.APP_BASE_URL 
        ? process.env.APP_BASE_URL.replace(/\/$/, '')
        : 'http://localhost:3000';

      // Format likes array to strings
      const likes = commentDoc.likes ? commentDoc.likes.map(like => like.toString()) : [];

      // Emit the like update to all users in the article room
      this.io.to(`article:${event.articleId}`).emit('commentLiked', {
        commentId: event.commentId,
        likes: event.likes,
        likesArray: likes, // Full array for frontend to check if user liked
        isLiked: event.isLiked,
        userId: event.userId
      });

      console.log(`❤️ Comment like broadcast to article room ${event.articleId} - ${event.isLiked ? 'liked' : 'unliked'} by user ${event.userId}`);
    } catch (error) {
      console.error('❌ Error handling comment liked event:', error);
    }
  }

  async handleCommentUpdated(event) {
    try {
      // Load the updated comment from database
      const Comment = require('../models/Comment');
      const commentDoc = await Comment.findById(event.commentId)
        .populate('author', 'username avatar role')
        .lean();

      if (!commentDoc) {
        console.error('❌ Comment not found:', event.commentId);
        return;
      }

      // Get base URL for avatar construction
      const baseUrl = process.env.APP_BASE_URL 
        ? process.env.APP_BASE_URL.replace(/\/$/, '')
        : 'http://localhost:3000';

      // Format comment to match frontend Comment interface
      const comment = {
        _id: commentDoc._id.toString(),
        content: commentDoc.content,
        author: {
          _id: commentDoc.author._id.toString(),
          username: commentDoc.author.username,
          avatar: commentDoc.author.avatar
            ? `${baseUrl}/api/users/${commentDoc.author._id}/avatar?t=${Date.now()}`
            : null,
          role: commentDoc.author.role || null
        },
        article: commentDoc.article.toString(),
        parentComment: commentDoc.parentComment ? commentDoc.parentComment.toString() : null,
        likes: commentDoc.likes ? commentDoc.likes.map(like => like.toString()) : [],
        isDeleted: commentDoc.isDeleted || false,
        createdAt: commentDoc.createdAt ? commentDoc.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: commentDoc.updatedAt ? commentDoc.updatedAt.toISOString() : new Date().toISOString(),
        replies: []
      };

      // Emit the updated comment to all users in the article room
      this.io.to(`article:${event.articleId}`).emit('commentUpdated', {
        commentId: event.commentId,
        comment: comment
      });

      console.log(`📝 Comment update broadcast to article room ${event.articleId} for comment ${event.commentId}`);
    } catch (error) {
      console.error('❌ Error handling comment updated event:', error);
    }
  }

  async handleCommentDeleted(event) {
    try {
      // Emit the deleted comment ID to all users in the article room
      this.io.to(`article:${event.articleId}`).emit('commentDeleted', {
        commentId: event.commentId
      });

      console.log(`🗑️ Comment delete broadcast to article room ${event.articleId} for comment ${event.commentId}`);
    } catch (error) {
      console.error('❌ Error handling comment deleted event:', error);
    }
  }

  async handleNotification(event) {
    try {
      if (!event.userId) {
        console.warn('⚠️ [EventConsumer] Notification event missing userId:', event);
        return;
      }

      // Prevent duplicate processing
      const eventKey = `${event.userId}:${event.notificationId}`;
      if (this.processedNotifications.has(eventKey)) {
        return;
      }
      
      this.processedNotifications.add(eventKey);
      
      // Clean up old entries to prevent memory leaks
      if (this.processedNotifications.size > 10000) {
        this.processedNotifications.clear();
      }

      // Emit notification to the user's room
      const notificationData = {
        id: event.notificationId || event._id,
        type: event.type || 'new_article',
        title: event.title,
        message: event.message,
        data: event.data || {},
        read: false,
        createdAt: new Date().toISOString(),
        articleId: event.articleId || event.data?.articleId,
        commentId: event.commentId || event.data?.commentId
      };

      this.io.to(`user:${event.userId}`).emit('newNotification', notificationData);

      // Emit unread count update - wait for notification to be saved
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Query using platform-server schema (uses 'read' and 'user' fields)
      const mongoose = require('mongoose');
      const NotificationCollection = mongoose.connection.collection('notifications');
      
      const unreadCount = await NotificationCollection.countDocuments({
        user: new mongoose.Types.ObjectId(event.userId),
        read: false
      });

      // Emit count update to user's room
      this.io.to(`user:${event.userId}`).emit('notificationCount', { count: unreadCount });
      
    } catch (error) {
      console.error('❌ [EventConsumer] Error handling notification event:', error);
    }
  }

  async handleNotificationRead(event) {
    try {
      if (!event.userId) {
        return;
      }

      // Emit count update to user
      this.io.to(`user:${event.userId}`).emit('notificationCount', { 
        count: event.unreadCount || 0 
      });

      // If it's a single notification read, emit the specific notification ID
      if (event.type === 'notification_read' && event.notificationId) {
        this.io.to(`user:${event.userId}`).emit('notification:read', {
          notificationId: event.notificationId,
          articleId: event.articleId || null
        });
      }
    } catch (error) {
      console.error('❌ [EventConsumer] Error handling notification read event:', error);
    }
  }
}

module.exports = EventConsumer;
