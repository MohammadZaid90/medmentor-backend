const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  agreeToTerms: { type: Boolean, default: false },
  role: { type: String, enum: ['student','teacher','admin'], default: 'student' },

    // Google
  googleId: { type: String, default: null },
  avatar: { type: String, default: null },
  
  // for password reset
  resetPasswordToken: String,
  resetPasswordExpires: Date,

  resetToken: String,
  resetTokenExpire: Date,

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
