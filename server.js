require("dotenv").config();
const express = require("express");
const cors = require("cors");
const passport = require("passport");
const cookieSession = require("cookie-session");
const connectDB = require("./config/db");
require("./passport");

const app = express();
connectDB();

// ✅ FIXED CORS (LOCAL + PRODUCTION)
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://your-frontend-url.vercel.app" // will update later
    ],
    credentials: true,
  })
);

// Middleware
app.use(express.json());

// Cookie session middleware
app.use(
  cookieSession({
    name: "session",
    keys: [process.env.COOKIE_KEY || "default_key"],
    maxAge: 24 * 60 * 60 * 1000,
  })
);

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/auth", require("./routes/googleAuth"));

app.get("/", (req, res) => {
  res.send("MedMentor Backend Running 🚀");
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));