const Notification = require('../models/Notification');

class NotificationService {
  async getUnreadNotifications(userId, limit = 20) {
    return Notification.find({ recipient: userId, isRead: false })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  async markAsRead(notificationIds) {
    await Notification.updateMany(
      { _id: { $in: notificationIds } },
      { $set: { isRead: true } }
    );
  }
}

module.exports = new NotificationService();
