const typingHandler = (socket, io) => {
  socket.on('globalTyping', (payload) => {
    socket.broadcast.emit('globalTyping', {
      userId: socket.userId,
      username: socket.username,
      isTyping: payload?.isTyping
    });
  });
};

module.exports = typingHandler;
