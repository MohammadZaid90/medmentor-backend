// backend/routes/googleAuth.js
const express = require('express');
const router = express.Router();

// Example Google OAuth route
router.get('/google', (req, res) => {
  res.send('Google Auth route works!');
});

module.exports = router;
