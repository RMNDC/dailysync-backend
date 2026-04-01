const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const dns = require('dns');

dns.setDefaultResultOrder('ipv4first');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

const SECRET_KEY = process.env.SECRET_KEY;
const MONGO_URI = process.env.MONGO_URI;
const BASE_URL = process.env.BASE_URL;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

if (!SECRET_KEY || !MONGO_URI || !BASE_URL || !EMAIL_USER || !EMAIL_PASS) {
  throw new Error('Missing required environment variables');
}

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many login attempts. Please try again after 15 minutes.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many accounts created. Please try again after 1 hour.' },
});

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 60000,
  socketTimeoutMS: 60000,
  connectTimeoutMS: 60000,
}).then(() => console.log('Connected to MongoDB!'))
  .catch((err) => console.log('Database connection error:', err.message));

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  username: { type: String, default: '' },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String },
  verificationTokenExpiry: { type: Date },
  resetPasswordToken: { type: String },
  resetPasswordExpiry: { type: Date },
});
const User = mongoose.model('User', UserSchema);

const HabitSchema = new mongoose.Schema({
  userId: String,
  name: String,
  done: Boolean,
  streak: { type: Number, default: 0 },
  lastCompleted: { type: Date },
  createdAt: { type: Date, default: Date.now },
});
const Habit = mongoose.model('Habit', HabitSchema);

const MoodSchema = new mongoose.Schema({
  userId: String,
  mood: String,
  note: String,
  date: String,
  createdAt: { type: Date, default: Date.now },
});
const Mood = mongoose.model('Mood', MoodSchema);

const GoalSchema = new mongoose.Schema({
  userId: String,
  name: String,
  done: Boolean,
  createdAt: { type: Date, default: Date.now },
});
const Goal = mongoose.model('Goal', GoalSchema);

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'No token provided.' });
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : authHeader;

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
}

app.get('/', (req, res) => {
  res.json({
    message: 'DailySync backend is running!',
    dbStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

app.post('/register', registerLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      if (!existingUser.isVerified) {
        const token = crypto.randomBytes(32).toString('hex');
        existingUser.verificationToken = token;
        existingUser.verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await existingUser.save();

        const verifyUrl = `${BASE_URL}/verify-email?token=${token}`;
        await transporter.sendMail({
          from: EMAIL_USER,
          to: normalizedEmail,
          subject: 'DailySync - Verify your email',
          html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;background:#f5f7fa;border-radius:12px;">
            <h2 style="color:#009688;">Welcome to DailySync! 🌱</h2>
            <p>Please verify your email address to complete your registration.</p>
            <a href="${verifyUrl}" style="display:inline-block;background:#009688;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Verify Email</a>
            <p style="color:#999;font-size:12px;margin-top:20px;">This link expires in 24 hours.</p>
          </div>`,
        });

        return res.status(400).json({
          success: false,
          message: 'Email already registered but not verified. A new verification email has been sent!',
        });
      }

      return res.status(400).json({ success: false, message: 'Email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const token = crypto.randomBytes(32).toString('hex');

    const newUser = new User({
      email: normalizedEmail,
      password: hashedPassword,
      isVerified: false,
      verificationToken: token,
      verificationTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await newUser.save();

    const verifyUrl = `${BASE_URL}/verify-email?token=${token}`;
    await transporter.sendMail({
      from: EMAIL_USER,
      to: normalizedEmail,
      subject: 'DailySync - Verify your email',
      html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;background:#f5f7fa;border-radius:12px;">
        <h2 style="color:#009688;">Welcome to DailySync! 🌱</h2>
        <p>Hi! Thanks for signing up. Please verify your email to get started.</p>
        <a href="${verifyUrl}" style="display:inline-block;background:#009688;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Verify Email</a>
        <p style="color:#999;font-size:12px;margin-top:20px;">This link expires in 24 hours. If you didn't sign up, ignore this email.</p>
      </div>`,
    });

    return res.json({ success: true, message: 'Account created! Please check your email to verify your account.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.send(`<div style="font-family:Arial,sans-serif;text-align:center;padding:40px;">
        <h2 style="color:#e53935;">❌ Invalid or expired link</h2>
        <p>Please register again to get a new verification email.</p>
      </div>`);
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpiry = undefined;
    await user.save();

    return res.send(`<div style="font-family:Arial,sans-serif;text-align:center;padding:40px;background:#f5f7fa;">
      <h2 style="color:#009688;">✅ Email Verified!</h2>
      <p>Your account has been verified successfully!</p>
      <p>You can now <a href="https://dailysync-app.netlify.app" style="color:#009688;font-weight:bold;">login to DailySync</a></p>
    </div>`);
  } catch (err) {
    return res.status(500).send('Something went wrong.');
  }
});

app.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    if (!user.isVerified) return res.status(401).json({ success: false, message: 'Please verify your email before logging in.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    const token = jwt.sign({ email: user.email, id: user._id }, SECRET_KEY, { expiresIn: '24h' });
    return res.json({ success: true, message: 'Login successful!', token, userId: user._id });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const resetUrl = `${BASE_URL}/reset-password?token=${token}`;
    await transporter.sendMail({
      from: EMAIL_USER,
      to: normalizedEmail,
      subject: 'DailySync - Reset your password',
      html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;background:#f5f7fa;border-radius:12px;">
        <h2 style="color:#009688;">Reset Your Password 🔑</h2>
        <p>You requested a password reset. Click below to set a new password.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#009688;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Reset Password</a>
        <p style="color:#999;font-size:12px;margin-top:20px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
      </div>`,
    });

    return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/reset-password', async (req, res) => {
  const { token } = req.query;
  return res.send(`<div style="font-family:Arial,sans-serif;max-width:400px;margin:40px auto;padding:20px;background:#f5f7fa;border-radius:12px;">
    <h2 style="color:#009688;">Reset Password 🔑</h2>
    <form method="POST" action="/reset-password">
      <input type="hidden" name="token" value="${token}">
      <label>New Password</label><br>
      <input type="password" name="password" required style="width:100%;padding:10px;margin:8px 0;border:1px solid #ccc;border-radius:8px;box-sizing:border-box;"><br>
      <label>Confirm Password</label><br>
      <input type="password" name="confirmPassword" required style="width:100%;padding:10px;margin:8px 0;border:1px solid #ccc;border-radius:8px;box-sizing:border-box;"><br>
      <button type="submit" style="width:100%;background:#009688;color:white;padding:12px;border:none;border-radius:8px;font-size:16px;cursor:pointer;margin-top:12px;">Reset Password</button>
    </form>
  </div>`);
});

app.post('/reset-password', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.send('<p style="color:red;font-family:Arial;text-align:center;">Passwords do not match. <a href="javascript:history.back()">Go back</a></p>');
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.send('<p style="color:red;font-family:Arial;text-align:center;">Invalid or expired reset link.</p>');
    }

    user.password = await bcrypt.hash(password, 12);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiry = undefined;
    await user.save();

    return res.send(`<div style="font-family:Arial,sans-serif;text-align:center;padding:40px;background:#f5f7fa;">
      <h2 style="color:#009688;">✅ Password Reset!</h2>
      <p>Your password has been reset successfully.</p>
      <a href="https://dailysync-app.netlify.app" style="color:#009688;font-weight:bold;">Login to DailySync</a>
    </div>`);
  } catch (err) {
    return res.status(500).send('Something went wrong.');
  }
});

app.get('/habits', verifyToken, async (req, res) => {
  try {
    const habits = await Habit.find({ userId: req.user.id });
    return res.json({ success: true, habits });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/habits', verifyToken, async (req, res) => {
  try {
    const habit = new Habit({ userId: req.user.id, name: req.body.name, done: false });
    await habit.save();
    return res.json({ success: true, habit });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/habits/:id', verifyToken, async (req, res) => {
  try {
    const habit = await Habit.findById(req.params.id);
    if (!habit) return res.status(404).json({ success: false, message: 'Habit not found.' });

    const newDone = req.body.done;
    let newStreak = habit.streak || 0;

    if (newDone) {
      const today = new Date();
      const lastCompleted = habit.lastCompleted;
      if (lastCompleted) {
        const diffDays = Math.floor((today - lastCompleted) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) newStreak += 1;
        else if (diffDays > 1) newStreak = 1;
      } else {
        newStreak = 1;
      }
    }

    const updated = await Habit.findByIdAndUpdate(
      req.params.id,
      {
        done: newDone,
        streak: newDone ? newStreak : habit.streak,
        lastCompleted: newDone ? new Date() : habit.lastCompleted,
      },
      { new: true }
    );

    return res.json({ success: true, habit: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/habits/:id', verifyToken, async (req, res) => {
  try {
    await Habit.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Habit deleted!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/moods', verifyToken, async (req, res) => {
  try {
    const moods = await Mood.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json({ success: true, moods });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/moods', verifyToken, async (req, res) => {
  try {
    const mood = new Mood({ userId: req.user.id, mood: req.body.mood, note: req.body.note, date: req.body.date });
    await mood.save();
    return res.json({ success: true, mood });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/goals', verifyToken, async (req, res) => {
  try {
    const goals = await Goal.find({ userId: req.user.id });
    return res.json({ success: true, goals });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/goals', verifyToken, async (req, res) => {
  try {
    const goal = new Goal({ userId: req.user.id, name: req.body.name, done: false });
    await goal.save();
    return res.json({ success: true, goal });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/goals/:id', verifyToken, async (req, res) => {
  try {
    const goal = await Goal.findByIdAndUpdate(req.params.id, { done: req.body.done }, { new: true });
    return res.json({ success: true, goal });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/goals/:id', verifyToken, async (req, res) => {
  try {
    await Goal.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Goal deleted!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`DailySync backend running on port ${PORT}`));
