const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { connectDB } = require('./db');
const walletsRouter = require('./routes/wallets');
const transactionsRouter = require('./routes/transactions');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for frontend communication
app.use(cors());

// Parse incoming JSON payloads
app.use(express.json());

// Request logging middleware for debugging and auditing
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Mount API routes
app.use('/api/wallets', walletsRouter);
app.use('/api/transactions', transactionsRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    application: 'Digital Wallet Management System API',
    timestamp: new Date(),
  });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled application error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

// Connect to MongoDB and start Express server
async function startServer() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`Digital Wallet Management System Backend`);
      console.log(`Server listening on http://localhost:${PORT}`);
      console.log(`MongoDB URI: ${process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'}`);
      console.log(`Database Name: ${process.env.DB_NAME || 'digital_wallet_db'}`);
      console.log(`=======================================================`);
    });
  } catch (error) {
    console.error('Failed to start server due to database connection error:', error.message);
    process.exit(1);
  }
}

startServer();
