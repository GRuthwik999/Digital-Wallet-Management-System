const express = require('express');
const router = express.Router();
const { getWalletsCollection, getTransactionsCollection, getClient } = require('../db');

// Helper to validate email format
function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

// 1. GET /api/wallets - Retrieve all wallets
router.get('/', async (req, res) => {
  try {
    const wallets = getWalletsCollection();
    const allWallets = await wallets.find({}).sort({ createdAt: -1 }).toArray();
    return res.status(200).json({ success: true, data: allWallets });
  } catch (error) {
    console.error('Error fetching wallets:', error);
    return res.status(500).json({ success: false, error: 'Internal server error fetching wallets' });
  }
});

// 2. GET /api/wallets/search?query=... - Search wallets by ID or name
// Note: Placed before /:id to prevent matching "search" as an ID
router.get('/search', async (req, res) => {
  try {
    const query = (req.query.query || '').trim();
    const wallets = getWalletsCollection();

    if (!query) {
      const allWallets = await wallets.find({}).sort({ createdAt: -1 }).toArray();
      return res.status(200).json({ success: true, data: allWallets });
    }

    // Search by walletId (exact or case-insensitive) or name (case-insensitive regex)
    const searchFilter = {
      $or: [
        { walletId: { $regex: query, $options: 'i' } },
        { name: { $regex: query, $options: 'i' } },
      ],
    };

    const results = await wallets.find(searchFilter).sort({ createdAt: -1 }).toArray();
    return res.status(200).json({ success: true, data: results, count: results.length });
  } catch (error) {
    console.error('Error searching wallets:', error);
    return res.status(500).json({ success: false, error: 'Internal server error searching wallets' });
  }
});

// 3. GET /api/wallets/:id - Retrieve single wallet by walletId
router.get('/:id', async (req, res) => {
  try {
    const walletId = req.params.id.trim();
    const wallets = getWalletsCollection();
    const wallet = await wallets.findOne({ walletId });

    if (!wallet) {
      return res.status(404).json({ success: false, error: `Wallet with ID '${walletId}' not found` });
    }

    return res.status(200).json({ success: true, data: wallet });
  } catch (error) {
    console.error('Error fetching wallet:', error);
    return res.status(500).json({ success: false, error: 'Internal server error fetching wallet' });
  }
});

// 4. POST /api/wallets - Create a new wallet
router.post('/', async (req, res) => {
  try {
    const { walletId, name, email, initialBalance } = req.body;

    // Field existence validation
    if (!walletId || typeof walletId !== 'string' || !walletId.trim()) {
      return res.status(400).json({ success: false, error: 'Wallet ID is required and must be non-empty' });
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'User name is required and must be non-empty' });
    }
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    // Email format validation
    const cleanEmail = email.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    // Balance validation
    const parsedBalance = Number(initialBalance);
    if (isNaN(parsedBalance) || parsedBalance < 0) {
      return res.status(400).json({ success: false, error: 'Initial balance must be a valid non-negative number' });
    }

    const cleanWalletId = walletId.trim();
    const wallets = getWalletsCollection();

    // Check unique walletId
    const existing = await wallets.findOne({ walletId: cleanWalletId });
    if (existing) {
      return res.status(409).json({ success: false, error: `Wallet ID '${cleanWalletId}' already exists. Please choose a unique ID.` });
    }

    const newWallet = {
      walletId: cleanWalletId,
      name: name.trim(),
      email: cleanEmail,
      balance: parseFloat(parsedBalance.toFixed(2)),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await wallets.insertOne(newWallet);

    // If initial balance is greater than 0, record an initial deposit in transactions
    if (newWallet.balance > 0) {
      const transactions = getTransactionsCollection();
      await transactions.insertOne({
        transactionId: `TXN-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
        type: 'DEPOSIT',
        amount: newWallet.balance,
        sourceWalletId: null,
        destinationWalletId: newWallet.walletId,
        status: 'SUCCESS',
        description: 'Initial balance upon wallet creation',
        createdAt: new Date(),
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Wallet created successfully',
      data: newWallet,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, error: 'Wallet ID already exists (duplicate key error)' });
    }
    console.error('Error creating wallet:', error);
    return res.status(500).json({ success: false, error: 'Internal server error creating wallet' });
  }
});

// 5. PUT /api/wallets/:id - Update wallet holder details (name, email)
router.put('/:id', async (req, res) => {
  try {
    const walletId = req.params.id.trim();
    const { name, email } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'User name is required and cannot be empty' });
    }
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    const wallets = getWalletsCollection();
    const result = await wallets.findOneAndUpdate(
      { walletId },
      { $set: { name: name.trim(), email: cleanEmail, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ success: false, error: `Wallet with ID '${walletId}' not found` });
    }

    return res.status(200).json({
      success: true,
      message: 'Wallet details updated successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error updating wallet:', error);
    return res.status(500).json({ success: false, error: 'Internal server error updating wallet' });
  }
});

// 6. DELETE /api/wallets/:id - Delete eligible wallet
// Requirements:
// - Prevent deletion of wallets with a non-zero balance.
// - Prevent deletion if the wallet has transaction records, so transaction history remains consistent.
// - Display a clear explanation when deletion is rejected.
router.delete('/:id', async (req, res) => {
  try {
    const walletId = req.params.id.trim();
    const wallets = getWalletsCollection();
    const transactions = getTransactionsCollection();

    const wallet = await wallets.findOne({ walletId });
    if (!wallet) {
      return res.status(404).json({ success: false, error: `Wallet with ID '${walletId}' not found` });
    }

    // Check 1: Non-zero balance
    if (wallet.balance > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete wallet '${walletId}' because it has a non-zero balance ($${wallet.balance.toFixed(2)}). Balances must be $0.00 before deletion.`,
      });
    }

    // Check 2: Existing transaction history
    const transactionCount = await transactions.countDocuments({
      $or: [{ sourceWalletId: walletId }, { destinationWalletId: walletId }],
    });

    if (transactionCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete wallet '${walletId}' because it has ${transactionCount} recorded transaction(s). Deletion is prohibited to preserve audit trail consistency.`,
      });
    }

    // Delete wallet
    await wallets.deleteOne({ walletId });
    return res.status(200).json({
      success: true,
      message: `Wallet '${walletId}' was successfully deleted.`,
    });
  } catch (error) {
    console.error('Error deleting wallet:', error);
    return res.status(500).json({ success: false, error: 'Internal server error deleting wallet' });
  }
});

// 7. POST /api/wallets/:id/deposit - Add money to wallet
router.post('/:id/deposit', async (req, res) => {
  try {
    const walletId = req.params.id.trim();
    const { amount, description } = req.body;

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Deposit amount must be a valid number greater than zero' });
    }

    const cleanAmount = parseFloat(parsedAmount.toFixed(2));
    const wallets = getWalletsCollection();
    const transactions = getTransactionsCollection();

    const wallet = await wallets.findOne({ walletId });
    if (!wallet) {
      return res.status(404).json({ success: false, error: `Wallet with ID '${walletId}' not found` });
    }

    // Increment balance
    const updatedWallet = await wallets.findOneAndUpdate(
      { walletId },
      { $inc: { balance: cleanAmount }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    // Record transaction
    const newTxn = {
      transactionId: `TXN-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      type: 'DEPOSIT',
      amount: cleanAmount,
      sourceWalletId: null,
      destinationWalletId: walletId,
      status: 'SUCCESS',
      description: description || `Deposit of $${cleanAmount.toFixed(2)}`,
      createdAt: new Date(),
    };
    await transactions.insertOne(newTxn);

    return res.status(200).json({
      success: true,
      message: `Successfully deposited $${cleanAmount.toFixed(2)} into wallet '${walletId}'`,
      data: {
        wallet: updatedWallet,
        transaction: newTxn,
      },
    });
  } catch (error) {
    console.error('Error depositing money:', error);
    return res.status(500).json({ success: false, error: 'Internal server error during deposit' });
  }
});

module.exports = router;
