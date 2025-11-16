const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  role: {
    type: String,
    enum: ['Admin', 'Éditeur', 'Rédacteur', 'Lecteur'],
    default: 'Lecteur'
  },
  verified: {
    type: Boolean,
    default: false
  },
  avatar: {
    type: String
  },
  refreshToken: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: false
  },
  viewedArticles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article'
  }]
}, {
  timestamps: true
});

// Only define the model if it doesn't already exist
module.exports = mongoose.models.User || mongoose.model('User', userSchema);

