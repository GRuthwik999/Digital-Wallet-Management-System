const express = require('express');
const router = express.Router();
const { getWalletsCollection, getTransactionsCollection, getClient } = require('../db');

// 1. GET /api/transactions - Retrieve transaction history (optionally filtered by walletId)
router.get('/', async (req, res) => {
  try {
    const { walletId } = req.query;
    const transactions = getTransactionsCollection();

    let query = {};
    if (walletId && walletId.trim()) {
      const cleanWalletId = walletId.trim();
      query = {
        $or: [
          { sourceWalletId: cleanWalletId },
          { destinationWalletId: cleanWalletId },
        ],
      };
    }

    const records = await transactions.find(query).sort({ createdAt: -1 }).toArray();
    return res.status(200).json({ success: true, count: records.length, data: records });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return res.status(500).json({ success: false, error: 'Internal server error fetching transactions' });
  }
});

// 2. POST /api/transactions/deposit - Deposit money directly via transactions endpoint
router.post('/deposit', async (req, res) => {
  try {
    const { walletId, amount, description } = req.body;

    if (!walletId || typeof walletId !== 'string' || !walletId.trim()) {
      return res.status(400).json({ success: false, error: 'Wallet ID is required' });
    }

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Deposit amount must be a valid number greater than zero' });
    }

    const cleanWalletId = walletId.trim();
    const cleanAmount = parseFloat(parsedAmount.toFixed(2));
    const wallets = getWalletsCollection();
    const transactions = getTransactionsCollection();

    const wallet = await wallets.findOne({ walletId: cleanWalletId });
    if (!wallet) {
      return res.status(404).json({ success: false, error: `Wallet with ID '${cleanWalletId}' not found` });
    }

    const updatedWallet = await wallets.findOneAndUpdate(
      { walletId: cleanWalletId },
      { $inc: { balance: cleanAmount }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    const newTxn = {
      transactionId: `TXN-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      type: 'DEPOSIT',
      amount: cleanAmount,
      sourceWalletId: null,
      destinationWalletId: cleanWalletId,
      status: 'SUCCESS',
      description: description || `Deposit of $${cleanAmount.toFixed(2)}`,
      createdAt: new Date(),
    };
    await transactions.insertOne(newTxn);

    return res.status(200).json({
      success: true,
      message: `Deposit of $${cleanAmount.toFixed(2)} completed successfully`,
      data: {
        wallet: updatedWallet,
        transaction: newTxn,
      },
    });
  } catch (error) {
    console.error('Error in deposit transaction:', error);
    return res.status(500).json({ success: false, error: 'Internal server error during deposit' });
  }
});

// 3. POST /api/transactions/transfer - Transfer money between two wallets
// Supports multi-document transactions where replica set is available,
// or safe conditional two-phase atomic updates with rollback compensation for standalone MongoDB.
router.post('/transfer', async (req, res) => {
  const { sourceWalletId, destinationWalletId, amount, description } = req.body;

  // Basic input validations
  if (!sourceWalletId || typeof sourceWalletId !== 'string' || !sourceWalletId.trim()) {
    return res.status(400).json({ success: false, error: 'Source wallet ID is required' });
  }
  if (!destinationWalletId || typeof destinationWalletId !== 'string' || !destinationWalletId.trim()) {
    return res.status(400).json({ success: false, error: 'Destination wallet ID is required' });
  }

  const cleanSourceId = sourceWalletId.trim();
  const cleanDestId = destinationWalletId.trim();

  // Prevent transfers to the same wallet
  if (cleanSourceId === cleanDestId) {
    return res.status(400).json({
      success: false,
      error: 'Cannot transfer money to the same wallet. Source and destination wallets must differ.',
    });
  }

  // Validate amount
  const parsedAmount = Number(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ success: false, error: 'Transfer amount must be a valid number greater than zero' });
  }
  const cleanAmount = parseFloat(parsedAmount.toFixed(2));

  const client = getClient();
  const wallets = getWalletsCollection();
  const transactions = getTransactionsCollection();

  // Verify existence of both wallets
  const sourceWallet = await wallets.findOne({ walletId: cleanSourceId });
  if (!sourceWallet) {
    return res.status(404).json({ success: false, error: `Source wallet '${cleanSourceId}' not found` });
  }

  const destWallet = await wallets.findOne({ walletId: cleanDestId });
  if (!destWallet) {
    return res.status(404).json({ success: false, error: `Destination wallet '${cleanDestId}' not found` });
  }

  // Verify sufficient balance
  if (sourceWallet.balance < cleanAmount) {
    return res.status(400).json({
      success: false,
      error: `Insufficient balance in source wallet '${cleanSourceId}'. Current balance: $${sourceWallet.balance.toFixed(2)}, required: $${cleanAmount.toFixed(2)}`,
    });
  }

  const txnRecord = {
    transactionId: `TXN-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
    type: 'TRANSFER',
    amount: cleanAmount,
    sourceWalletId: cleanSourceId,
    destinationWalletId: cleanDestId,
    status: 'SUCCESS',
    description: description || `Transfer of $${cleanAmount.toFixed(2)} from ${cleanSourceId} to ${cleanDestId}`,
    createdAt: new Date(),
  };

  // Attempt to use MongoDB Multi-Document Transaction if replica set is active
  let session = null;
  let usedReplicaTransaction = false;

  try {
    session = client.startSession();
    await session.withTransaction(async () => {
      // 1. Deduct from source with conditional check
      const deductResult = await wallets.updateOne(
        { walletId: cleanSourceId, balance: { $gte: cleanAmount } },
        { $inc: { balance: -cleanAmount }, $set: { updatedAt: new Date() } },
        { session }
      );
      if (deductResult.modifiedCount === 0) {
        throw new Error('INSUFFICIENT_FUNDS_OR_CONCURRENT_UPDATE');
      }

      // 2. Add to destination
      const addResult = await wallets.updateOne(
        { walletId: cleanDestId },
        { $inc: { balance: cleanAmount }, $set: { updatedAt: new Date() } },
        { session }
      );
      if (addResult.modifiedCount === 0) {
        throw new Error('DESTINATION_UPDATE_FAILED');
      }

      // 3. Log transaction
      await transactions.insertOne(txnRecord, { session });
    });

    usedReplicaTransaction = true;
  } catch (txError) {
    // If MongoDB error indicates standalone mode (transactions only allowed on replica set)
    const isStandaloneError =
      txError.message &&
      (txError.message.includes('replica set member') ||
        txError.message.includes('Transaction numbers are only allowed on a replica set') ||
        txError.code === 20 ||
        txError.codeName === 'IllegalOperation');

    if (isStandaloneError) {
      // Fallback: Safe conditional two-phase atomic update with compensating rollback
      try {
        // Step 1: Atomic conditional deduction from source
        const deductResult = await wallets.updateOne(
          { walletId: cleanSourceId, balance: { $gte: cleanAmount } },
          { $inc: { balance: -cleanAmount }, $set: { updatedAt: new Date() } }
        );

        if (deductResult.modifiedCount === 0) {
          return res.status(400).json({
            success: false,
            error: `Transfer rejected: Insufficient funds in source wallet '${cleanSourceId}'.`,
          });
        }

        // Step 2: Increment destination wallet
        try {
          const addResult = await wallets.updateOne(
            { walletId: cleanDestId },
            { $inc: { balance: cleanAmount }, $set: { updatedAt: new Date() } }
          );

          if (addResult.modifiedCount === 0) {
            throw new Error('Destination wallet could not be updated.');
          }
        } catch (destErr) {
          // Compensating transaction (rollback source deduction)
          console.warn(`[Compensating Transaction] Rolling back source wallet deduction for ${cleanSourceId}...`);
          await wallets.updateOne(
            { walletId: cleanSourceId },
            { $inc: { balance: cleanAmount }, $set: { updatedAt: new Date() } }
          );
          return res.status(500).json({
            success: false,
            error: 'Transfer failed when crediting destination wallet. Source balance was safely restored without any loss.',
          });
        }

        // Step 3: Record transaction in transactions collection
        await transactions.insertOne(txnRecord);
      } catch (safeErr) {
        console.error('Error during safe two-phase transfer:', safeErr);
        return res.status(500).json({ success: false, error: 'Database error occurred during transfer operation' });
      }
    } else {
      // Transaction failed due to business logic (e.g., insufficient funds)
      if (txError.message === 'INSUFFICIENT_FUNDS_OR_CONCURRENT_UPDATE') {
        return res.status(400).json({
          success: false,
          error: `Transfer rejected: Insufficient funds in source wallet '${cleanSourceId}'.`,
        });
      }
      console.error('Transaction error:', txError);
      return res.status(500).json({ success: false, error: `Transfer failed: ${txError.message}` });
    }
  } finally {
    if (session) {
      await session.endSession();
    }
  }

  // Fetch updated balances for response
  const updatedSource = await wallets.findOne({ walletId: cleanSourceId });
  const updatedDest = await wallets.findOne({ walletId: cleanDestId });

  return res.status(200).json({
    success: true,
    message: `Successfully transferred $${cleanAmount.toFixed(2)} from '${cleanSourceId}' to '${cleanDestId}'`,
    data: {
      transaction: txnRecord,
      sourceWallet: updatedSource,
      destinationWallet: updatedDest,
      consistencyMethod: usedReplicaTransaction ? 'MongoDB Replica Set Transaction' : 'Two-Phase Atomic Conditional Update with Rollback Compensation',
    },
  });
});

// 4. GET /api/dashboard/stats - Aggregate stats for the dashboard
router.get('/stats', async (req, res) => {
  try {
    const wallets = getWalletsCollection();
    const transactions = getTransactionsCollection();

    const totalWallets = await wallets.countDocuments();
    const totalTransactions = await transactions.countDocuments();

    // Sum total balance across all wallets
    const balanceAgg = await wallets.aggregate([
      { $group: { _id: null, totalBalance: { $sum: '$balance' } } },
    ]).toArray();

    const totalBalance = balanceAgg.length > 0 ? parseFloat(balanceAgg[0].totalBalance.toFixed(2)) : 0;

    return res.status(200).json({
      success: true,
      data: {
        totalWallets,
        totalBalance,
        totalTransactions,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({ success: false, error: 'Internal server error calculating stats' });
  }
});

module.exports = router;
