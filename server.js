require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'fallbackSecret';

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Schemas
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  phone: String,
  passwordHash: String,
  role: { type: String, default: 'user' },
  location: {
    lat: Number,
    lng: Number,
    updatedAt: Date,
  },
});

const BookingSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  hairdresserName: String,
  date: Date,
  status: { type: String, default: 'pending' },
  price: Number,
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', UserSchema);
const Booking = mongoose.model('Booking', BookingSchema);

// Auth middleware
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).send('Unauthorized');

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).send('Unauthorized');
  }
};

// Routes

// Register user
app.post('/api/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password)
    return res.status(400).json({ error: 'All fields are required' });

  const existing = await User.findOne({ email });
  if (existing) return res.status(400).json({ error: 'Email already registered' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = new User({ name, email, phone, passwordHash });
  await user.save();

  res.json({ message: 'User registered successfully' });
});

// Login user
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: 'Invalid email or password' });

  const validPass = await bcrypt.compare(password, user.passwordHash);
  if (!validPass) return res.status(400).json({ error: 'Invalid email or password' });

  const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { name: user.name, email: user.email, phone: user.phone, role: user.role } });
});

// Update user location
app.post('/api/location', authMiddleware, async (req, res) => {
  const { lat, lng } = req.body;
  if (lat === undefined || lng === undefined) return res.status(400).json({ error: 'Coordinates required' });

  await User.findByIdAndUpdate(req.user.id, {
    location: { lat, lng, updatedAt: new Date() },
  });

  res.json({ message: 'Location updated' });
});

// Book appointment
app.post('/api/bookings', authMiddleware, async (req, res) => {
  const { hairdresserName, date, price } = req.body;
  if (!hairdresserName || !date || price === undefined)
    return res.status(400).json({ error: 'All booking details are required' });

  const booking = new Booking({
    userId: req.user.id,
    hairdresserName,
    date: new Date(date),
    price,
  });
  await booking.save();

  res.json({ message: 'Booking created' });
});

// Get bookings for user
app.get('/api/bookings', authMiddleware, async (req, res) => {
  const bookings = await Booking.find({ userId: req.user.id }).sort({ date: -1 });
  res.json(bookings);
});

// Admin: get all users with locations
app.get('/api/admin/users-locations', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const users = await User.find({ 'location.lat': { $exists: true } }, 'name email phone location');
  res.json(users);
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
