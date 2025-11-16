const commentHandler = (socket, io) => {
  // User joins an article room
  socket.on('joinArticle', (articleId) => {
    socket.join(`article:${articleId}`);
    console.log(`✅ User ${socket.username || socket.userId} joined article room ${articleId}`);
  });

  // User leaves an article room
  socket.on('leaveArticle', (articleId) => {
    socket.leave(`article:${articleId}`);
    console.log(`👋 User ${socket.username || socket.userId} left article room ${articleId}`);
  });

  // Typing indicator
  socket.on('typing', (data) => {
    socket.to(`article:${data.articleId}`).emit('userTyping', {
      userId: socket.userId,
      username: socket.username,
      isTyping: data.isTyping
    });
  });

  // User joins their personal room for notifications
  socket.on('joinUserRoom', () => {
    socket.join(`user:${socket.userId}`);
    console.log(`✅ User ${socket.username || socket.userId} joined personal room`);
  });
};

module.exports = commentHandler;
