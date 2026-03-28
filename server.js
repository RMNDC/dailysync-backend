const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'dailysync_secret_key';
const MONGO_URI = 'mongodb+srv://dailysync-user:DjX7cs4r9liT5lkP@dailysync-db.uujpu9p.mongodb.net/dailysync?retryWrites=true&w=majority&appName=dailysync-db';

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 60000,
  socketTimeoutMS: 60000,
  connectTimeoutMS: 60000,
}).then(() => console.log('Connected to MongoDB!'))
  .catch((err) => console.log('Database connection error:', err.message));

// Models
const UserSchema = new mongoose.Schema({ email: String, password: String });
const User = mongoose.model('User', UserSchema);

const HabitSchema = new mongoose.Schema({ userId: String, name: String, done: Boolean, createdAt: { type: Date, default: Date.now } });
const Habit = mongoose.model('Habit', HabitSchema);

const MoodSchema = new mongoose.Schema({ userId: String, mood: String, note: String, date: String, createdAt: { type: Date, default: Date.now } });
const Mood = mongoose.model('Mood', MoodSchema);

const GoalSchema = new mongoose.Schema({ userId: String, name: String, done: Boolean, createdAt: { type: Date, default: Date.now } });
const Goal = mongoose.model('Goal', GoalSchema);

// Auth middleware
function verifyToken(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ success: false, message: 'No token provided.' });
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid token.' });
  }
}

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'DailySync backend is running!', dbStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// Auth routes
app.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ success: false, message: 'Email already exists.' });
    const newUser = new User({ email, password });
    await newUser.save();
    res.json({ success: true, message: 'User registered successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, password });
    if (user) {
      const token = jwt.sign({ email: user.email, id: user._id }, SECRET_KEY, { expiresIn: '24h' });
      res.json({ success: true, message: 'Login successful!', token, userId: user._id });
    } else {
      res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Habits routes
app.get('/habits', verifyToken, async (req, res) => {
  try {
    const habits = await Habit.find({ userId: req.user.id });
    res.json({ success: true, habits });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/habits', verifyToken, async (req, res) => {
  try {
    const habit = new Habit({ userId: req.user.id, name: req.body.name, done: false });
    await habit.save();
    res.json({ success: true, habit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/habits/:id', verifyToken, async (req, res) => {
  try {
    const habit = await Habit.findByIdAndUpdate(req.params.id, { done: req.body.done }, { new: true });
    res.json({ success: true, habit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/habits/:id', verifyToken, async (req, res) => {
  try {
    await Habit.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Habit deleted!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Mood routes
app.get('/moods', verifyToken, async (req, res) => {
  try {
    const moods = await Mood.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, moods });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/moods', verifyToken, async (req, res) => {
  try {
    const mood = new Mood({ userId: req.user.id, mood: req.body.mood, note: req.body.note, date: req.body.date });
    await mood.save();
    res.json({ success: true, mood });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Goals routes
app.get('/goals', verifyToken, async (req, res) => {
  try {
    const goals = await Goal.find({ userId: req.user.id });
    res.json({ success: true, goals });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/goals', verifyToken, async (req, res) => {
  try {
    const goal = new Goal({ userId: req.user.id, name: req.body.name, done: false });
    await goal.save();
    res.json({ success: true, goal });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/goals/:id', verifyToken, async (req, res) => {
  try {
    const goal = await Goal.findByIdAndUpdate(req.params.id, { done: req.body.done }, { new: true });
    res.json({ success: true, goal });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/goals/:id', verifyToken, async (req, res) => {
  try {
    await Goal.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Goal deleted!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`DailySync backend running on http://localhost:${PORT}`));
