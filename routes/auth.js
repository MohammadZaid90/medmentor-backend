const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');


const User = require('../models/User');


// Helper to sign token (adjust expiry with rememberMe)
function signToken(userId, rememberMe = false) {
  const baseExpiry = process.env.JWT_EXPIRES_IN || '7d';
  const expiresIn = rememberMe ? '30d' : baseExpiry;
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn });
}

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'Gmail', // or your email provider
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // app password for Gmail
  },
});

/**
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, confirmPassword, agreeToTerms } = req.body;
    if (!name || !email || !password || !confirmPassword)
      return res.status(400).json({ msg: 'Please fill all required fields' });

    if (password !== confirmPassword)
      return res.status(400).json({ msg: 'Passwords do not match' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ msg: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    const user = new User({
      name,
      email,
      password: hashed,
      agreeToTerms: !!agreeToTerms,
    });

    await user.save();

    const token = signToken(user._id, false);
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;
    if (!email || !password)
      return res.status(400).json({ msg: 'Please enter email and password' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

    const token = signToken(user._id, !!rememberMe);

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

/**
 * POST /api/auth/forgot-password
 * body: { email }
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // create token
    const resetToken = crypto.randomBytes(32).toString("hex");

    user.resetToken = resetToken;
    user.resetTokenExpire = Date.now() + 15 * 60 * 1000; // 15 min
    await user.save();

    // send email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const resetLink = `http://localhost:5173/reset-password/${resetToken}`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Request",
      html: `
        <h3>Password Reset</h3>
        <p>Click below to reset your password:</p>
        <a href="${resetLink}">Reset Password</a>
        <p>This link expires in 15 minutes.</p>
      `,
    });

    res.json({ msg: "Reset email sent!" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error" });
  }
});

/**
 * POST /api/auth/reset-password
 * body: { token, newPassword, confirmPassword }
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ msg: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ msg: "Passwords do not match" });
    }

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ msg: "Invalid or expired token" });
    }

    // ✅ HASH PASSWORD (IMPORTANT)
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    user.resetToken = undefined;
    user.resetTokenExpire = undefined;

    await user.save();

    res.json({ msg: "Password updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: "Server error" });
  }
});

/**
 * POST /api/auth/google
 * body: { idToken }   // idToken = credential from Google (JWT)
 */
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ msg: 'No ID token provided' });

    // Verify token with Google
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    // payload contains: email, name, picture, sub (Google user id), email_verified, etc.
    const { email, name, picture, sub: googleId, email_verified } = payload;

    if (!email_verified) {
      // optional: reject unverified emails
      // return res.status(400).json({ msg: 'Google email not verified' });
    }

    // Find existing user by email
    let user = await User.findOne({ email });

    if (!user) {
      // Create new user (password not required for Google accounts)
      user = new User({
        name: name || email.split('@')[0],
        email,
        password: crypto.randomBytes(20).toString('hex'), // random password (never used)
        agreeToTerms: true,
        googleId,
        // optional: store avatar
        avatar: picture,
      });

      await user.save();
    } else {
      // If user exists but doesn't have googleId saved, save it (link accounts)
      if (!user.googleId) {
        user.googleId = googleId;
        if (!user.avatar && picture) user.avatar = picture;
        await user.save();
      }
    }

    // Sign your app token (same signToken helper you already have)
    const token = signToken(user._id, true); // you may set rememberMe true

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar }
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ msg: 'Google sign-in failed', error: err.message });
  }
});


module.exports = router;
