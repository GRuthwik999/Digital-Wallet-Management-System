import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api';

function App() {
  const [activeTab, setActiveTab] = useState('wallets');
  const [wallets, setWallets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loadingWallets, setLoadingWallets] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [alert, setAlert] = useState(null); // { type: 'success'|'danger'|'warning'|'info', message: '' }

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isFiltered, setIsFiltered] = useState(false);

  // Create Wallet form
  const [createForm, setCreateForm] = useState({
    walletId: '',
    name: '',
    email: '',
    initialBalance: '0',
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Edit Wallet Modal state
  const [editWallet, setEditWallet] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Delete Wallet Confirmation state
  const [deleteWallet, setDeleteWallet] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Add Money (Deposit) form state
  const [depositForm, setDepositForm] = useState({
    walletId: '',
    amount: '',
    description: '',
  });
  const [depositSubmitting, setDepositSubmitting] = useState(false);

  // Transfer Money form state
  const [transferForm, setTransferForm] = useState({
    sourceWalletId: '',
    destinationWalletId: '',
    amount: '',
    description: '',
  });
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  // Transaction History filter state
  const [historyWalletFilter, setHistoryWalletFilter] = useState('');

  // -------------------------------------------------------------
  // Data Fetching Functions
  // -------------------------------------------------------------
  const fetchWallets = useCallback(async (query = '') => {
    setLoadingWallets(true);
    try {
      const url = query.trim()
        ? `${API_BASE}/wallets/search?query=${encodeURIComponent(query.trim())}`
        : `${API_BASE}/wallets`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setWallets(data.data || []);
        setIsFiltered(Boolean(query.trim()));
      } else {
        setAlert({ type: 'danger', message: data.error || 'Failed to fetch wallets' });
      }
    } catch (err) {
      setAlert({
        type: 'danger',
        message: `Network error connecting to backend: ${err.message}. Make sure backend server is running on port 3000.`,
      });
    } finally {
      setLoadingWallets(false);
    }
  }, []);

  const fetchTransactions = useCallback(async (walletId = '') => {
    setLoadingTransactions(true);
    try {
      const url = walletId.trim()
        ? `${API_BASE}/transactions?walletId=${encodeURIComponent(walletId.trim())}`
        : `${API_BASE}/transactions`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setTransactions(data.data || []);
      } else {
        setAlert({ type: 'danger', message: data.error || 'Failed to fetch transactions' });
      }
    } catch (err) {
      setAlert({
        type: 'danger',
        message: `Network error loading transactions: ${err.message}`,
      });
    } finally {
      setLoadingTransactions(false);
    }
  }, []);

  // Refresh both wallets and transactions after mutations
  const refreshAllData = useCallback(async () => {
    await Promise.all([fetchWallets(), fetchTransactions(historyWalletFilter)]);
  }, [fetchWallets, fetchTransactions, historyWalletFilter]);

  // Initial load
  useEffect(() => {
    fetchWallets();
    fetchTransactions();
  }, [fetchWallets, fetchTransactions]);

  // Refetch transactions whenever history filter changes
  useEffect(() => {
    fetchTransactions(historyWalletFilter);
  }, [historyWalletFilter, fetchTransactions]);

  // -------------------------------------------------------------
  // Dashboard Metrics
  // -------------------------------------------------------------
  const totalWallets = wallets.length;
  const totalBalance = wallets.reduce((sum, w) => sum + (Number(w.balance) || 0), 0);
  const recentTransactions = transactions.slice(0, 5);

  // -------------------------------------------------------------
  // Search Handlers
  // -------------------------------------------------------------
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchWallets(searchQuery);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    fetchWallets('');
  };

  // -------------------------------------------------------------
  // 1. Create Wallet Handler
  // -------------------------------------------------------------
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setAlert(null);

    const cleanWalletId = createForm.walletId.trim();
    const cleanName = createForm.name.trim();
    const cleanEmail = createForm.email.trim();
    const balanceNum = Number(createForm.initialBalance);

    if (!cleanWalletId) {
      setAlert({ type: 'danger', message: 'Wallet ID is required.' });
      return;
    }
    if (!cleanName) {
      setAlert({ type: 'danger', message: 'Account Holder Name is required.' });
      return;
    }
    if (!cleanEmail) {
      setAlert({ type: 'danger', message: 'Email address is required.' });
      return;
    }
    if (isNaN(balanceNum) || balanceNum < 0) {
      setAlert({ type: 'danger', message: 'Initial balance must be a non-negative number.' });
      return;
    }

    setCreateSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: cleanWalletId,
          name: cleanName,
          email: cleanEmail,
          initialBalance: balanceNum,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAlert({
          type: 'success',
          message: `Wallet '${data.data.walletId}' created successfully for ${data.data.name} with initial balance of $${Number(data.data.balance).toFixed(2)}.`,
        });
        setCreateForm({ walletId: '', name: '', email: '', initialBalance: '0' });
        await refreshAllData();
        setActiveTab('wallets');
      } else {
        setAlert({ type: 'danger', message: data.error || 'Failed to create wallet.' });
      }
    } catch (err) {
      setAlert({ type: 'danger', message: `Network error creating wallet: ${err.message}` });
    } finally {
      setCreateSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // 2. Edit / Update Wallet Handlers
  // -------------------------------------------------------------
  const openEditModal = (wallet) => {
    setEditWallet(wallet);
    setEditForm({ name: wallet.name, email: wallet.email });
  };

  const handleUpdateWallet = async (e) => {
    e.preventDefault();
    if (!editWallet) return;

    const cleanName = editForm.name.trim();
    const cleanEmail = editForm.email.trim();

    if (!cleanName) {
      setAlert({ type: 'danger', message: 'Name cannot be empty.' });
      return;
    }
    if (!cleanEmail) {
      setAlert({ type: 'danger', message: 'Email cannot be empty.' });
      return;
    }

    setEditSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/wallets/${encodeURIComponent(editWallet.walletId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, email: cleanEmail }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAlert({
          type: 'success',
          message: `Wallet '${editWallet.walletId}' updated successfully.`,
        });
        setEditWallet(null);
        await refreshAllData();
      } else {
        setAlert({ type: 'danger', message: data.error || 'Failed to update wallet.' });
      }
    } catch (err) {
      setAlert({ type: 'danger', message: `Network error updating wallet: ${err.message}` });
    } finally {
      setEditSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // 3. Delete Wallet Handlers
  // -------------------------------------------------------------
  const openDeleteConfirm = (wallet) => {
    setDeleteWallet(wallet);
  };

  const handleExecuteDelete = async () => {
    if (!deleteWallet) return;

    setDeleteSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/wallets/${encodeURIComponent(deleteWallet.walletId)}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAlert({
          type: 'success',
          message: data.message || `Wallet '${deleteWallet.walletId}' was successfully deleted.`,
        });
        setDeleteWallet(null);
        await refreshAllData();
      } else {
        setAlert({
          type: 'danger',
          message: data.error || `Failed to delete wallet '${deleteWallet.walletId}'.`,
        });
        setDeleteWallet(null);
      }
    } catch (err) {
      setAlert({ type: 'danger', message: `Network error deleting wallet: ${err.message}` });
      setDeleteWallet(null);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // 4. Add Money (Deposit) Handler
  // -------------------------------------------------------------
  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    setAlert(null);

    const { walletId, amount, description } = depositForm;
    if (!walletId) {
      setAlert({ type: 'danger', message: 'Please select a destination wallet.' });
      return;
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setAlert({ type: 'danger', message: 'Deposit amount must be a valid number greater than zero.' });
      return;
    }

    setDepositSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/wallets/${encodeURIComponent(walletId)}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: numAmount,
          description: description.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAlert({
          type: 'success',
          message: `Successfully deposited $${numAmount.toFixed(2)} into wallet '${walletId}'. New balance: $${Number(data.data.wallet.balance).toFixed(2)}.`,
        });
        setDepositForm({ walletId: '', amount: '', description: '' });
        await refreshAllData();
        setActiveTab('wallets');
      } else {
        setAlert({ type: 'danger', message: data.error || 'Deposit failed.' });
      }
    } catch (err) {
      setAlert({ type: 'danger', message: `Network error during deposit: ${err.message}` });
    } finally {
      setDepositSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // 5. Transfer Money Handler
  // -------------------------------------------------------------
  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    setAlert(null);

    const { sourceWalletId, destinationWalletId, amount, description } = transferForm;

    if (!sourceWalletId) {
      setAlert({ type: 'danger', message: 'Please select a source wallet.' });
      return;
    }
    if (!destinationWalletId) {
      setAlert({ type: 'danger', message: 'Please select a destination wallet.' });
      return;
    }
    if (sourceWalletId === destinationWalletId) {
      setAlert({
        type: 'danger',
        message: 'Cannot transfer to the same wallet. Source and destination wallets must differ.',
      });
      return;
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setAlert({ type: 'danger', message: 'Transfer amount must be greater than zero.' });
      return;
    }

    const sourceWallet = wallets.find((w) => w.walletId === sourceWalletId);
    if (sourceWallet && sourceWallet.balance < numAmount) {
      setAlert({
        type: 'danger',
        message: `Insufficient funds! Source wallet balance is $${Number(sourceWallet.balance).toFixed(2)}, which is less than requested transfer of $${numAmount.toFixed(2)}.`,
      });
      return;
    }

    setTransferSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/transactions/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceWalletId,
          destinationWalletId,
          amount: numAmount,
          description: description.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAlert({
          type: 'success',
          message: `Transfer complete! Transferred $${numAmount.toFixed(2)} from '${sourceWalletId}' to '${destinationWalletId}'.`,
        });
        setTransferForm({
          sourceWalletId: '',
          destinationWalletId: '',
          amount: '',
          description: '',
        });
        await refreshAllData();
        setActiveTab('transactions');
      } else {
        setAlert({ type: 'danger', message: data.error || 'Transfer failed.' });
      }
    } catch (err) {
      setAlert({ type: 'danger', message: `Network error during transfer: ${err.message}` });
    } finally {
      setTransferSubmitting(false);
    }
  };

  // Helper for source wallet balance preview
  const selectedSourceWallet = wallets.find((w) => w.walletId === transferForm.sourceWalletId);

  return (
    <div className="min-vh-100 d-flex flex-column bg-light">
      {/* Top Navbar */}
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary shadow-sm">
        <div className="container">
          <span className="navbar-brand d-flex align-items-center gap-2">
            <i className="bi bi-wallet2 fs-4"></i>
            Digital Wallet Management System
          </span>
          <span className="badge bg-light text-primary px-3 py-2 fw-semibold">
            React + Express + MongoDB
          </span>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="container my-4 flex-grow-1">
        {/* Global Notifications Alert */}
        {alert && (
          <div
            className={`alert alert-${alert.type} alert-dismissible fade show shadow-sm d-flex align-items-center justify-content-between`}
            role="alert"
          >
            <div>
              <i
                className={`bi ${
                  alert.type === 'success'
                    ? 'bi-check-circle-fill'
                    : alert.type === 'warning'
                    ? 'bi-exclamation-triangle-fill'
                    : 'bi-exclamation-octagon-fill'
                } me-2`}
              ></i>
              {alert.message}
            </div>
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              onClick={() => setAlert(null)}
            ></button>
          </div>
        )}

        {/* Dashboard Metric Summary Cards */}
        <div className="row g-3 mb-4">
          <div className="col-12 col-md-4">
            <div className="card border-0 bg-primary text-white shadow-sm h-100">
              <div className="card-body d-flex align-items-center justify-content-between p-4">
                <div>
                  <h6 className="card-subtitle text-white-50 mb-1 text-uppercase">Total Wallets</h6>
                  <h2 className="card-title mb-0 fw-bold">{totalWallets}</h2>
                </div>
                <div className="bg-white bg-opacity-25 p-3 rounded-circle">
                  <i className="bi bi-people-fill fs-2"></i>
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className="card border-0 bg-success text-white shadow-sm h-100">
              <div className="card-body d-flex align-items-center justify-content-between p-4">
                <div>
                  <h6 className="card-subtitle text-white-50 mb-1 text-uppercase">Combined Balance</h6>
                  <h2 className="card-title mb-0 fw-bold">${totalBalance.toFixed(2)}</h2>
                </div>
                <div className="bg-white bg-opacity-25 p-3 rounded-circle">
                  <i className="bi bi-cash-stack fs-2"></i>
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className="card border-0 bg-dark text-white shadow-sm h-100">
              <div className="card-body d-flex align-items-center justify-content-between p-4">
                <div>
                  <h6 className="card-subtitle text-white-50 mb-1 text-uppercase">Total Transactions</h6>
                  <h2 className="card-title mb-0 fw-bold">{transactions.length}</h2>
                </div>
                <div className="bg-white bg-opacity-25 p-3 rounded-circle">
                  <i className="bi bi-arrow-left-right fs-2"></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity Bar (Dashboard Requirement) */}
        {recentTransactions.length > 0 && (
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
              <span className="fw-bold text-secondary">
                <i className="bi bi-activity me-2 text-primary"></i>Recent System Activity
              </span>
              <button
                className="btn btn-sm btn-link text-decoration-none p-0"
                onClick={() => setActiveTab('transactions')}
              >
                View Full History &rarr;
              </button>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0 small">
                  <thead className="table-light">
                    <tr>
                      <th>Time</th>
                      <th>Type</th>
                      <th>Parties</th>
                      <th className="text-end">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.map((tx) => (
                      <tr key={tx.transactionId || tx._id}>
                        <td className="text-muted">
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString() : 'N/A'}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              tx.type === 'DEPOSIT' ? 'bg-success' : 'bg-primary'
                            }`}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td>
                          {tx.type === 'DEPOSIT' ? (
                            <span>To <strong className="font-monospace">{tx.destinationWalletId}</strong></span>
                          ) : (
                            <span>
                              <strong className="font-monospace">{tx.sourceWalletId}</strong> &rarr;{' '}
                              <strong className="font-monospace">{tx.destinationWalletId}</strong>
                            </span>
                          )}
                        </td>
                        <td className="text-end fw-bold font-monospace">
                          ${Number(tx.amount).toFixed(2)}
                        </td>
                        <td>
                          <span className="badge bg-light text-dark border">
                            {tx.status || 'SUCCESS'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <ul className="nav nav-pills nav-fill bg-white p-2 rounded shadow-sm mb-4 border">
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'wallets' ? 'active' : ''}`}
              onClick={() => setActiveTab('wallets')}
            >
              <i className="bi bi-card-list me-1"></i> Wallets & Search
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'create' ? 'active' : ''}`}
              onClick={() => setActiveTab('create')}
            >
              <i className="bi bi-plus-circle me-1"></i> Create Wallet
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'add-money' ? 'active' : ''}`}
              onClick={() => setActiveTab('add-money')}
            >
              <i className="bi bi-arrow-down-circle me-1"></i> Add Money
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'transfer' ? 'active' : ''}`}
              onClick={() => setActiveTab('transfer')}
            >
              <i className="bi bi-arrow-left-right me-1"></i> Transfer Money
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'transactions' ? 'active' : ''}`}
              onClick={() => setActiveTab('transactions')}
            >
              <i className="bi bi-clock-history me-1"></i> Transaction History
            </button>
          </li>
        </ul>

        {/* Tab Panels */}
        <div className="card shadow-sm border-0">
          <div className="card-body p-4">
            {/* ----------------------------------------------------- */}
            {/* TAB 1: Wallets & Search & Management                 */}
            {/* ----------------------------------------------------- */}
            {activeTab === 'wallets' && (
              <div>
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                  <div>
                    <h4 className="fw-bold mb-0">Registered Wallets</h4>
                    <p className="text-muted small mb-0">
                      Manage wallets, search records, update account details, or remove eligible zero-balance wallets.
                    </p>
                  </div>
                  <button
                    className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
                    onClick={() => fetchWallets(searchQuery)}
                    disabled={loadingWallets}
                  >
                    <i className={`bi bi-arrow-clockwise ${loadingWallets ? 'spin' : ''}`}></i>
                    Refresh
                  </button>
                </div>

                {/* Search Bar */}
                <form onSubmit={handleSearchSubmit} className="row g-2 mb-3">
                  <div className="col-12 col-md-6 col-lg-5">
                    <div className="input-group">
                      <span className="input-group-text bg-white">
                        <i className="bi bi-search text-muted"></i>
                      </span>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Search by Wallet ID or Account Name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="col-auto">
                    <button type="submit" className="btn btn-primary" disabled={loadingWallets}>
                      Search
                    </button>
                  </div>
                  {isFiltered && (
                    <div className="col-auto">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={handleClearSearch}
                      >
                        Clear Filter
                      </button>
                    </div>
                  )}
                </form>

                {isFiltered && (
                  <div className="alert alert-info py-2 small d-flex align-items-center justify-content-between mb-3">
                    <span>
                      <i className="bi bi-funnel me-1"></i> Showing search results for: <strong>"{searchQuery}"</strong> ({wallets.length} found)
                    </span>
                    <button className="btn btn-sm btn-link text-decoration-none p-0" onClick={handleClearSearch}>
                      Reset
                    </button>
                  </div>
                )}

                {/* Wallets Table */}
                {loadingWallets ? (
                  <div className="text-center py-5">
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">Loading wallets...</span>
                    </div>
                    <p className="text-muted mt-2">Loading wallets from MongoDB...</p>
                  </div>
                ) : wallets.length === 0 ? (
                  <div className="text-center py-5 border rounded bg-light">
                    <i className="bi bi-wallet2 fs-1 text-muted"></i>
                    <h5 className="mt-3 text-secondary">
                      {isFiltered ? 'No Wallets Found Matching Search' : 'No Wallets Registered Yet'}
                    </h5>
                    <p className="text-muted mb-3">
                      {isFiltered
                        ? 'Try searching with a different wallet ID or holder name.'
                        : 'Register your first digital wallet to get started.'}
                    </p>
                    {isFiltered ? (
                      <button className="btn btn-outline-primary" onClick={handleClearSearch}>
                        Clear Search
                      </button>
                    ) : (
                      <button className="btn btn-primary" onClick={() => setActiveTab('create')}>
                        <i className="bi bi-plus-circle me-1"></i> Create Wallet Now
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Wallet ID</th>
                          <th>Account Holder</th>
                          <th>Email Address</th>
                          <th className="text-end">Balance</th>
                          <th>Created At</th>
                          <th className="text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wallets.map((w) => (
                          <tr key={w.walletId}>
                            <td>
                              <span className="badge bg-secondary font-monospace fs-6">
                                {w.walletId}
                              </span>
                            </td>
                            <td className="fw-semibold">{w.name}</td>
                            <td className="text-muted">{w.email}</td>
                            <td className="text-end fw-bold text-success font-monospace fs-6">
                              ${Number(w.balance).toFixed(2)}
                            </td>
                            <td className="text-muted small">
                              {w.createdAt ? new Date(w.createdAt).toLocaleString() : 'N/A'}
                            </td>
                            <td className="text-center">
                              <div className="btn-group btn-group-sm">
                                <button
                                  className="btn btn-outline-primary"
                                  title="Edit Wallet Details"
                                  onClick={() => openEditModal(w)}
                                >
                                  <i className="bi bi-pencil-square me-1"></i> Edit
                                </button>
                                <button
                                  className="btn btn-outline-danger"
                                  title="Delete Wallet"
                                  onClick={() => openDeleteConfirm(w)}
                                >
                                  <i className="bi bi-trash3 me-1"></i> Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ----------------------------------------------------- */}
            {/* TAB 2: Create Wallet                                 */}
            {/* ----------------------------------------------------- */}
            {activeTab === 'create' && (
              <div>
                <h4 className="fw-bold mb-2">Create New Digital Wallet</h4>
                <p className="text-muted mb-4">
                  Register a new account holder. Wallet IDs must be unique across the system.
                </p>

                <form onSubmit={handleCreateSubmit} style={{ maxWidth: '600px' }}>
                  <div className="mb-3">
                    <label htmlFor="walletId" className="form-label fw-semibold">
                      Wallet ID <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control font-monospace"
                      id="walletId"
                      placeholder="e.g. WAL-1001, USER99"
                      value={createForm.walletId}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, walletId: e.target.value })
                      }
                      required
                    />
                    <div className="form-text">Unique system identifier for this wallet.</div>
                  </div>

                  <div className="mb-3">
                    <label htmlFor="name" className="form-label fw-semibold">
                      Account Holder Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      id="name"
                      placeholder="e.g. Jane Doe"
                      value={createForm.name}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, name: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label htmlFor="email" className="form-label fw-semibold">
                      Email Address <span className="text-danger">*</span>
                    </label>
                    <input
                      type="email"
                      className="form-control"
                      id="email"
                      placeholder="e.g. jane.doe@example.com"
                      value={createForm.email}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, email: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="mb-4">
                    <label htmlFor="initialBalance" className="form-label fw-semibold">
                      Initial Deposit Amount ($) <span className="text-danger">*</span>
                    </label>
                    <div className="input-group">
                      <span className="input-group-text">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-control font-monospace"
                        id="initialBalance"
                        placeholder="0.00"
                        value={createForm.initialBalance}
                        onChange={(e) =>
                          setCreateForm({ ...createForm, initialBalance: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="form-text">
                      Must be non-negative. Deposits &gt; $0.00 will automatically create an audit deposit record.
                    </div>
                  </div>

                  <div className="d-flex gap-2">
                    <button
                      type="submit"
                      className="btn btn-primary d-flex align-items-center gap-2"
                      disabled={createSubmitting}
                    >
                      {createSubmitting ? (
                        <>
                          <span className="spinner-border spinner-border-sm" role="status"></span>
                          Creating Wallet...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-plus-circle"></i> Create Wallet
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() =>
                        setCreateForm({ walletId: '', name: '', email: '', initialBalance: '0' })
                      }
                    >
                      Clear Form
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ----------------------------------------------------- */}
            {/* TAB 3: Add Money (Deposit)                           */}
            {/* ----------------------------------------------------- */}
            {activeTab === 'add-money' && (
              <div>
                <h4 className="fw-bold mb-2">Add Money (Deposit)</h4>
                <p className="text-muted mb-4">
                  Credit funds into an existing digital wallet. This operation will record an official audit deposit transaction.
                </p>

                {wallets.length === 0 ? (
                  <div className="alert alert-warning">
                    <i className="bi bi-exclamation-triangle-fill me-2"></i>
                    No wallets available to deposit funds. Please{' '}
                    <button
                      className="btn btn-link p-0 align-baseline"
                      onClick={() => setActiveTab('create')}
                    >
                      create a wallet
                    </button>{' '}
                    first.
                  </div>
                ) : (
                  <form onSubmit={handleDepositSubmit} style={{ maxWidth: '600px' }}>
                    <div className="mb-3">
                      <label htmlFor="depositWallet" className="form-label fw-semibold">
                        Select Destination Wallet <span className="text-danger">*</span>
                      </label>
                      <select
                        id="depositWallet"
                        className="form-select font-monospace"
                        value={depositForm.walletId}
                        onChange={(e) =>
                          setDepositForm({ ...depositForm, walletId: e.target.value })
                        }
                        required
                      >
                        <option value="">-- Choose a Wallet --</option>
                        {wallets.map((w) => (
                          <option key={w.walletId} value={w.walletId}>
                            {w.walletId} &mdash; {w.name} (Current: ${Number(w.balance).toFixed(2)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-3">
                      <label htmlFor="depositAmount" className="form-label fw-semibold">
                        Deposit Amount ($) <span className="text-danger">*</span>
                      </label>
                      <div className="input-group">
                        <span className="input-group-text">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          className="form-control font-monospace"
                          id="depositAmount"
                          placeholder="0.00"
                          value={depositForm.amount}
                          onChange={(e) =>
                            setDepositForm({ ...depositForm, amount: e.target.value })
                          }
                          required
                        />
                      </div>
                      {/* Quick preset amount chips */}
                      <div className="mt-2 d-flex gap-2">
                        {[10, 50, 100, 500].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() =>
                              setDepositForm({ ...depositForm, amount: amt.toString() })
                            }
                          >
                            +${amt}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mb-4">
                      <label htmlFor="depositDesc" className="form-label fw-semibold">
                        Transaction Description (Optional)
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        id="depositDesc"
                        placeholder="e.g. Salary Credit, Bank Top-up, Cash Deposit"
                        value={depositForm.description}
                        onChange={(e) =>
                          setDepositForm({ ...depositForm, description: e.target.value })
                        }
                      />
                    </div>

                    <button
                      type="submit"
                      className="btn btn-success d-flex align-items-center gap-2"
                      disabled={depositSubmitting}
                    >
                      {depositSubmitting ? (
                        <>
                          <span className="spinner-border spinner-border-sm" role="status"></span>
                          Processing Deposit...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-arrow-down-circle"></i> Complete Deposit
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* ----------------------------------------------------- */}
            {/* TAB 4: Transfer Money                                */}
            {/* ----------------------------------------------------- */}
            {activeTab === 'transfer' && (
              <div>
                <h4 className="fw-bold mb-2">Transfer Money Between Wallets</h4>
                <p className="text-muted mb-4">
                  Safely move funds from one registered wallet to another with real-time balance checks and atomic transaction consistency.
                </p>

                {wallets.length < 2 ? (
                  <div className="alert alert-warning">
                    <i className="bi bi-exclamation-triangle-fill me-2"></i>
                    At least two wallets are required to perform a money transfer. You currently have{' '}
                    {wallets.length} wallet(s). Please{' '}
                    <button
                      className="btn btn-link p-0 align-baseline"
                      onClick={() => setActiveTab('create')}
                    >
                      create another wallet
                    </button>.
                  </div>
                ) : (
                  <form onSubmit={handleTransferSubmit} style={{ maxWidth: '650px' }}>
                    <div className="row g-3 mb-3">
                      <div className="col-12 col-md-6">
                        <label htmlFor="sourceWallet" className="form-label fw-semibold">
                          Source Wallet (From) <span className="text-danger">*</span>
                        </label>
                        <select
                          id="sourceWallet"
                          className="form-select font-monospace"
                          value={transferForm.sourceWalletId}
                          onChange={(e) =>
                            setTransferForm({ ...transferForm, sourceWalletId: e.target.value })
                          }
                          required
                        >
                          <option value="">-- Select Source --</option>
                          {wallets.map((w) => (
                            <option key={w.walletId} value={w.walletId}>
                              {w.walletId} &mdash; ${Number(w.balance).toFixed(2)} ({w.name})
                            </option>
                          ))}
                        </select>
                        {selectedSourceWallet && (
                          <div className="form-text text-primary">
                            Available Balance: <strong>${Number(selectedSourceWallet.balance).toFixed(2)}</strong>
                          </div>
                        )}
                      </div>

                      <div className="col-12 col-md-6">
                        <label htmlFor="destWallet" className="form-label fw-semibold">
                          Destination Wallet (To) <span className="text-danger">*</span>
                        </label>
                        <select
                          id="destWallet"
                          className="form-select font-monospace"
                          value={transferForm.destinationWalletId}
                          onChange={(e) =>
                            setTransferForm({
                              ...transferForm,
                              destinationWalletId: e.target.value,
                            })
                          }
                          required
                        >
                          <option value="">-- Select Destination --</option>
                          {wallets.map((w) => (
                            <option
                              key={w.walletId}
                              value={w.walletId}
                              disabled={w.walletId === transferForm.sourceWalletId}
                            >
                              {w.walletId} &mdash; {w.name}
                            </option>
                          ))}
                        </select>
                        {transferForm.sourceWalletId &&
                          transferForm.sourceWalletId === transferForm.destinationWalletId && (
                            <div className="form-text text-danger">
                              Source and Destination wallets cannot be identical.
                            </div>
                          )}
                      </div>
                    </div>

                    <div className="mb-3">
                      <label htmlFor="transferAmount" className="form-label fw-semibold">
                        Transfer Amount ($) <span className="text-danger">*</span>
                      </label>
                      <div className="input-group">
                        <span className="input-group-text">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          className="form-control font-monospace"
                          id="transferAmount"
                          placeholder="0.00"
                          value={transferForm.amount}
                          onChange={(e) =>
                            setTransferForm({ ...transferForm, amount: e.target.value })
                          }
                          required
                        />
                      </div>
                      {selectedSourceWallet &&
                        Number(transferForm.amount) > Number(selectedSourceWallet.balance) && (
                          <div className="form-text text-danger fw-semibold">
                            Amount exceeds available source balance (${Number(selectedSourceWallet.balance).toFixed(2)}).
                          </div>
                        )}
                    </div>

                    <div className="mb-4">
                      <label htmlFor="transferDesc" className="form-label fw-semibold">
                        Transaction Description (Optional)
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        id="transferDesc"
                        placeholder="e.g. Dinner bill split, Monthly rent, Reimbursable expense"
                        value={transferForm.description}
                        onChange={(e) =>
                          setTransferForm({ ...transferForm, description: e.target.value })
                        }
                      />
                    </div>

                    <button
                      type="submit"
                      className="btn btn-primary d-flex align-items-center gap-2"
                      disabled={
                        transferSubmitting ||
                        !transferForm.sourceWalletId ||
                        !transferForm.destinationWalletId ||
                        transferForm.sourceWalletId === transferForm.destinationWalletId ||
                        (selectedSourceWallet &&
                          Number(transferForm.amount) > Number(selectedSourceWallet.balance))
                      }
                    >
                      {transferSubmitting ? (
                        <>
                          <span className="spinner-border spinner-border-sm" role="status"></span>
                          Processing Transfer...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-arrow-left-right"></i> Execute Transfer
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* ----------------------------------------------------- */}
            {/* TAB 5: Transaction History                           */}
            {/* ----------------------------------------------------- */}
            {activeTab === 'transactions' && (
              <div>
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                  <div>
                    <h4 className="fw-bold mb-0">Transaction Audit History</h4>
                    <p className="text-muted small mb-0">
                      Immutable transaction log of deposits, creation deposits, and peer transfers.
                    </p>
                  </div>
                  <button
                    className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
                    onClick={() => fetchTransactions(historyWalletFilter)}
                    disabled={loadingTransactions}
                  >
                    <i className={`bi bi-arrow-clockwise ${loadingTransactions ? 'spin' : ''}`}></i>
                    Refresh History
                  </button>
                </div>

                {/* Filter Toolbar */}
                <div className="row g-2 mb-3 align-items-center">
                  <div className="col-12 col-md-5 col-lg-4">
                    <label htmlFor="historyFilterSelect" className="form-label small fw-semibold text-secondary mb-1">
                      Filter by Wallet ID:
                    </label>
                    <select
                      id="historyFilterSelect"
                      className="form-select form-select-sm font-monospace"
                      value={historyWalletFilter}
                      onChange={(e) => setHistoryWalletFilter(e.target.value)}
                    >
                      <option value="">-- All Wallets (Full System Log) --</option>
                      {wallets.map((w) => (
                        <option key={w.walletId} value={w.walletId}>
                          {w.walletId} &mdash; {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {historyWalletFilter && (
                    <div className="col-auto align-self-end">
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => setHistoryWalletFilter('')}
                      >
                        Reset Filter
                      </button>
                    </div>
                  )}
                </div>

                {/* Transactions Table */}
                {loadingTransactions ? (
                  <div className="text-center py-5">
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">Loading audit records...</span>
                    </div>
                    <p className="text-muted mt-2">Loading transactions from database...</p>
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-5 border rounded bg-light">
                    <i className="bi bi-clock-history fs-1 text-muted"></i>
                    <h5 className="mt-3 text-secondary">No Transactions Recorded</h5>
                    <p className="text-muted mb-0">
                      {historyWalletFilter
                        ? `No transactions found involving wallet '${historyWalletFilter}'.`
                        : 'Transactions will appear here as soon as deposits or transfers take place.'}
                    </p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Transaction ID</th>
                          <th>Date & Time</th>
                          <th>Type</th>
                          <th>Source Wallet</th>
                          <th>Destination Wallet</th>
                          <th className="text-end">Amount</th>
                          <th>Status</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((tx) => (
                          <tr key={tx.transactionId || tx._id}>
                            <td>
                              <span className="badge bg-light text-dark border font-monospace">
                                {tx.transactionId}
                              </span>
                            </td>
                            <td className="text-muted small">
                              {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : 'N/A'}
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  tx.type === 'DEPOSIT'
                                    ? 'bg-success'
                                    : tx.type === 'TRANSFER'
                                    ? 'bg-primary'
                                    : 'bg-secondary'
                                }`}
                              >
                                {tx.type}
                              </span>
                            </td>
                            <td>
                              {tx.sourceWalletId ? (
                                <span className="badge bg-secondary font-monospace">
                                  {tx.sourceWalletId}
                                </span>
                              ) : (
                                <span className="text-muted">&mdash;</span>
                              )}
                            </td>
                            <td>
                              {tx.destinationWalletId ? (
                                <span className="badge bg-secondary font-monospace">
                                  {tx.destinationWalletId}
                                </span>
                              ) : (
                                <span className="text-muted">&mdash;</span>
                              )}
                            </td>
                            <td className="text-end fw-bold font-monospace text-dark">
                              ${Number(tx.amount).toFixed(2)}
                            </td>
                            <td>
                              <span className="badge bg-success-subtle text-success border border-success-subtle">
                                {tx.status || 'SUCCESS'}
                              </span>
                            </td>
                            <td className="text-muted small text-truncate" style={{ maxWidth: '220px' }}>
                              {tx.description || 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* --------------------------------------------------------- */}
      {/* Edit Wallet Modal (Pure React Controlled Modal)          */}
      {/* --------------------------------------------------------- */}
      {editWallet && (
        <div
          className="modal show d-block"
          tabIndex="-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-pencil-square me-2 text-primary"></i>
                  Edit Wallet: <span className="font-monospace text-secondary">{editWallet.walletId}</span>
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setEditWallet(null)}
                ></button>
              </div>
              <form onSubmit={handleUpdateWallet}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Wallet ID</label>
                    <input
                      type="text"
                      className="form-control font-monospace"
                      value={editWallet.walletId}
                      disabled
                    />
                    <div className="form-text">Wallet IDs are unique and cannot be modified.</div>
                  </div>
                  <div className="mb-3">
                    <label htmlFor="editName" className="form-label fw-semibold">
                      Account Holder Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      id="editName"
                      className="form-control"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="editEmail" className="form-label fw-semibold">
                      Email Address <span className="text-danger">*</span>
                    </label>
                    <input
                      type="email"
                      id="editEmail"
                      className="form-control"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditWallet(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary d-flex align-items-center gap-1"
                    disabled={editSubmitting}
                  >
                    {editSubmitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status"></span>
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- */}
      {/* Delete Confirmation Modal (Pure React Controlled Modal)   */}
      {/* --------------------------------------------------------- */}
      {deleteWallet && (
        <div
          className="modal show d-block"
          tabIndex="-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title">
                  <i className="bi bi-exclamation-triangle-fill me-2"></i> Confirm Wallet Deletion
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  aria-label="Close"
                  onClick={() => setDeleteWallet(null)}
                ></button>
              </div>
              <div className="modal-body">
                <p>
                  Are you sure you want to permanently delete wallet{' '}
                  <strong className="font-monospace">{deleteWallet.walletId}</strong> belonging to{' '}
                  <strong>{deleteWallet.name}</strong>?
                </p>

                <div className="alert alert-warning small mb-0">
                  <h6 className="fw-bold mb-1">
                    <i className="bi bi-shield-check me-1"></i> Deletion Eligibility Rules:
                  </h6>
                  <ul className="mb-0 ps-3">
                    <li>
                      Balance must be <strong>$0.00</strong> (Current:{' '}
                      <span className={deleteWallet.balance > 0 ? 'text-danger fw-bold' : 'text-success fw-bold'}>
                        ${Number(deleteWallet.balance).toFixed(2)}
                      </span>
                      )
                    </li>
                    <li>Wallet must have <strong>zero recorded transactions</strong> to preserve audit trail consistency.</li>
                  </ul>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDeleteWallet(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger d-flex align-items-center gap-1"
                  onClick={handleExecuteDelete}
                  disabled={deleteSubmitting}
                >
                  {deleteSubmitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status"></span>
                      Deleting...
                    </>
                  ) : (
                    'Confirm Delete'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-top py-3 text-center text-muted small mt-auto">
        <div className="container">
          Digital Wallet Management System &bull; Full Stack IA3 Project (React + Bootstrap + Node.js + Express + MongoDB)
        </div>
      </footer>
    </div>
  );
}

export default App;
