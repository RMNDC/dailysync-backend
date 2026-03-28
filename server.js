const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'dailysync_secret_key';

const MONGO_URI = 'mongodb+srv://dailysync-user:DjX7cs4r9liT5lkP@dailysync-db.uujpu9p.mongodb.net/dailysync?retryWrites=true&w=majority';

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB!'))
  .catch((err) => console.log('Database connection error:', err));

const UserSchema = new mongoose.Schema({
  email: String,
  password: String,
});
const User = mongoose.model('User', UserSchema);

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

app.get('/', (req, res) => {
  res.json({ message: 'DailySync backend is running!' });
});

app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ success: false, message: 'Email already exists.' });
  }
  const newUser = new User({ email, password });
  await newUser.save();
  res.json({ success: true, message: 'User registered successfully!' });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, password });
  if (user) {
    const token = jwt.sign({ email: user.email, id: user._id }, SECRET_KEY, { expiresIn: '24h' });
    res.json({ success: true, message: 'Login successful!', token: token });
  } else {
    res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }
});

app.listen(PORT, () => {
  console.log(`DailySync backend running on http://localhost:${PORT}`);
});
