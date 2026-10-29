const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.DB_NAME || 'digital_wallet_db';

let client;
let db;

async function connectDB() {
  if (db) return db;

  try {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    console.log(`[Database] Connected successfully to MongoDB at ${uri}, database: ${dbName}`);

    // Create unique index for walletId in wallets collection
    const wallets = db.collection('wallets');
    await wallets.createIndex({ walletId: 1 }, { unique: true });

    // Create index for transactions
    const transactions = db.collection('transactions');
    await transactions.createIndex({ transactionId: 1 }, { unique: true });
    await transactions.createIndex({ createdAt: -1 });

    return db;
  } catch (error) {
    console.error('[Database] MongoDB connection error:', error.message);
    throw error;
  }
}

function getDB() {
  if (!db) {
    throw new Error('Database not initialized. Call connectDB first.');
  }
  return db;
}

function getWalletsCollection() {
  return getDB().collection('wallets');
}

function getTransactionsCollection() {
  return getDB().collection('transactions');
}

function getClient() {
  return client;
}

module.exports = {
  connectDB,
  getDB,
  getWalletsCollection,
  getTransactionsCollection,
  getClient,
};
