const commentHandler = (socket, io) => {
  // User joins an article room
  socket.on('joinArticle', (articleId) => {
    const roomName = `article:${articleId}`;
    
    // Only join if not already in room (prevents duplicate joins)
    if (!socket.rooms.has(roomName)) {
      socket.join(roomName);
    }
  });

  // User leaves an article room
  socket.on('leaveArticle', (articleId) => {
    socket.leave(`article:${articleId}`);
  });

  // Typing indicator
  socket.on('typing', (data) => {
    socket.to(`article:${data.articleId}`).emit('userTyping', {
      userId: socket.userId,
      username: socket.username,
      isTyping: data.isTyping
    });
  });

  // Note: User's personal room is already joined in socketAuth middleware
};

module.exports = commentHandler;
