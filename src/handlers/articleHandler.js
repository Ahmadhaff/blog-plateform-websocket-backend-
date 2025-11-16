const mongoose = require('mongoose');
const Article = require('../models/Article');
const User = require('../models/User');

/**
 * Article handler for Socket.IO events
 * Handles article-related real-time events like view increments
 */
const articleHandler = (socket, io) => {
  /**
   * Handle article view increment
   * Emitted when an authenticated user views an article
   */
  socket.on('incrementArticleView', async (data) => {
    try {
      const { articleId } = data;

      if (!articleId) {
        socket.emit('error', { message: 'Article ID is required' });
        return;
      }

      const userId = socket.userId;
      const articleObjectId = new mongoose.Types.ObjectId(articleId);

      // Check if article exists
      const article = await Article.findById(articleObjectId);
      if (!article) {
        socket.emit('error', { message: 'Article not found' });
        return;
      }

      // Check if user has already viewed this article
      const user = await User.findById(userId).select('viewedArticles');
      
      if (user) {
        // Convert viewedArticles to string array for comparison
        const viewedArticleIds = user.viewedArticles.map(id => id.toString());
        const articleIdString = articleId.toString();

        if (!viewedArticleIds.includes(articleIdString)) {
          // User hasn't viewed this article yet - increment views and track it
          article.views += 1;
          await article.save();

          // Add article to user's viewedArticles array
          user.viewedArticles.push(articleObjectId);
          await user.save();

          console.log(`✅ Article view incremented by user ${socket.username} for article ${article.title}`);

          // Broadcast updated view count to ALL users in the article room (including the user who just viewed)
          // This ensures real-time updates for everyone viewing the article
          io.to(`article:${articleId}`).emit('articleViewUpdated', {
            articleId: articleId,
            views: article.views
          });
          
          // Also send confirmation to the user who triggered the increment
          socket.emit('articleViewUpdated', {
            articleId: articleId,
            views: article.views
          });
        }
        // If user has already viewed this article, do nothing
      }
    } catch (error) {
      console.error('❌ Error incrementing article view:', error);
      socket.emit('error', { message: 'Failed to increment article view' });
    }
  });
};

module.exports = articleHandler;

