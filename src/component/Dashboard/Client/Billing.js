import React, { useState, useEffect } from 'react';
import { auth, db } from '../../../services/firestoreShim';
import './Billing.css';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  doc,
  getDoc
} from '../../../services/firestoreShim';
import { 
  CreditCard, 
  DollarSign, 
  Calendar, 
  Download, 
  Eye, 
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  CreditCard as CardIcon,
  TrendingUp,
  TrendingDown,
  Filter,
  Search
} from 'lucide-react';
import Paged from '../../Common/Paged';

export default function ClientBilling() {
  const [billingHistory, setBillingHistory] = useState([]);
  const [clientData, setClientData] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filteredHistory, setFilteredHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  const currentUser = auth.currentUser;

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'paid', label: 'Paid' },
    { value: 'pending', label: 'Pending' },
    { value: 'failed', label: 'Failed' },
    { value: 'refunded', label: 'Refunded' }
  ];

  const dateOptions = [
    { value: 'all', label: 'All Time' },
    { value: '30', label: 'Last 30 Days' },
    { value: '90', label: 'Last 90 Days' },
    { value: '365', label: 'Last Year' }
  ];

  useEffect(() => {
    if (!currentUser) return;

    const fetchBillingData = async () => {
      try {
        setIsLoading(true);
        
        // Get client ID
        const clientId = localStorage.getItem('th.clientId') || currentUser.uid;
        
        // Fetch client profile
        const clientDoc = await getDoc(doc(db, 'clients', clientId));
        if (clientDoc.exists()) {
          const clientProfile = clientDoc.data();
          setClientData({ id: clientDoc.id, ...clientProfile });
        }

        // Fetch billing history
        const billingQuery = query(
          collection(db, 'billing'),
          where('clientId', '==', clientId),
          orderBy('createdAt', 'desc')
        );
        const billingSnapshot = await getDocs(billingQuery);
        const history = billingSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setBillingHistory(history);
        setFilteredHistory(history);

        // Fetch payment methods
        const paymentMethodsQuery = query(
          collection(db, 'paymentMethods'),
          where('clientId', '==', clientId),
          where('isActive', '==', true)
        );
        const paymentMethodsSnapshot = await getDocs(paymentMethodsQuery);
        const methods = paymentMethodsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setPaymentMethods(methods);

        // Fetch subscription info
        const subscriptionQuery = query(
          collection(db, 'subscriptions'),
          where('clientId', '==', clientId),
          where('status', 'in', ['active', 'pending', 'cancelled']),
          orderBy('createdAt', 'desc'),
          limit(1)
        );
        const subscriptionSnapshot = await getDocs(subscriptionQuery);
        if (!subscriptionSnapshot.empty) {
          const sub = subscriptionSnapshot.docs[0].data();
          setSubscription({ id: subscriptionSnapshot.docs[0].id, ...sub });
        }

      } catch (error) {
        console.error('Error fetching billing data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBillingData();
  }, [currentUser]);

  // Filter billing history
  useEffect(() => {
    let filtered = billingHistory;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.amount?.toString().includes(searchTerm)
      );
    }

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(item => item.status === statusFilter);
    }

    // Filter by date
    if (dateFilter !== 'all') {
      const days = parseInt(dateFilter);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      filtered = filtered.filter(item => {
        const itemDate = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
        return itemDate >= cutoffDate;
      });
    }

    setFilteredHistory(filtered);
  }, [billingHistory, searchTerm, statusFilter, dateFilter]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="text-green-500" size={16} />;
      case 'pending':
        return <Clock className="text-yellow-500" size={16} />;
      case 'failed':
        return <AlertCircle className="text-red-500" size={16} />;
      case 'refunded':
        return <TrendingDown className="text-blue-500" size={16} />;
      default:
        return <AlertCircle className="text-gray-500" size={16} />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'refunded':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const getTotalAmount = () => {
    return filteredHistory.reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  const getOutstandingBalance = () => {
    return filteredHistory
      .filter(item => item.status === 'pending' || item.status === 'failed')
      .reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  const downloadInvoice = (invoice) => {
    // This would typically generate and download a PDF invoice
    console.log('Downloading invoice:', invoice.invoiceNumber);
    // For now, just show an alert
    alert(`Downloading invoice ${invoice.invoiceNumber}`);
  };

  if (isLoading) {
    return (
      <div className="billing-loading">
        <div className="loading-spinner"></div>
        <p>Loading billing information...</p>
      </div>
    );
  }

  return (
    <div className="client-billing">
      <div className="billing-header">
        <h1 className="page-title">Billing & Payments</h1>
        <p className="subtitle">Manage your payments and view billing history</p>
      </div>

      {/* Billing Summary */}
      <div className="billing-summary">
        <div className="summary-cards">
          <div className="summary-card">
            <div className="card-icon">
              <DollarSign size={24} />
            </div>
            <div className="card-content">
              <h3>Total Paid</h3>
              <p className="amount">{formatCurrency(getTotalAmount())}</p>
            </div>
          </div>
          
          <div className="summary-card">
            <div className="card-icon">
              <AlertCircle size={24} />
            </div>
            <div className="card-content">
              <h3>Outstanding</h3>
              <p className="amount outstanding">{formatCurrency(getOutstandingBalance())}</p>
            </div>
          </div>
          
          <div className="summary-card">
            <div className="card-icon">
              <CreditCard size={24} />
            </div>
            <div className="card-content">
              <h3>Payment Methods</h3>
              <p className="count">{paymentMethods.length} active</p>
            </div>
          </div>
        </div>
      </div>

      {/* Current Subscription */}
      {subscription && (
        <div className="subscription-section">
          <h2 className="section-title">Current Subscription</h2>
          <div className="subscription-card">
            <div className="subscription-info">
              <h3>{subscription.planName || 'Standard Plan'}</h3>
              <p className="subscription-price">
                {formatCurrency(subscription.amount)} / {subscription.billingCycle || 'month'}
              </p>
              <div className={`subscription-status ${getStatusColor(subscription.status)}`}>
                {getStatusIcon(subscription.status)}
                <span>{subscription.status}</span>
              </div>
            </div>
            <div className="subscription-actions">
              <button className="btn-secondary">
                <Eye size={16} />
                View Details
              </button>
              <button className="btn-primary">
                <CreditCard size={16} />
                Update Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Methods */}
      <div className="payment-methods-section">
        <h2 className="section-title">Payment Methods</h2>
        {paymentMethods.length === 0 ? (
          <div className="no-payment-methods">
            <CardIcon size={48} />
            <h3>No payment methods</h3>
            <p>Add a payment method to manage your subscription</p>
            <button className="btn-primary">
              <CreditCard size={16} />
              Add Payment Method
            </button>
          </div>
        ) : (
          <div className="payment-methods-grid">
            {paymentMethods.map((method) => (
              <div key={method.id} className="payment-method-card">
                <div className="method-icon">
                  <CardIcon size={24} />
                </div>
                <div className="method-info">
                  <h4>{method.cardType} ending in {method.lastFour}</h4>
                  <p>Expires {method.expiryMonth}/{method.expiryYear}</p>
                  {method.isDefault && (
                    <span className="default-badge">Default</span>
                  )}
                </div>
                <div className="method-actions">
                  <button className="btn-secondary">Edit</button>
                  <button className="btn-danger">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Billing History */}
      <div className="billing-history-section">
        <div className="history-header">
          <h2 className="section-title">Billing History</h2>
          <div className="history-controls">
            <div className="search-bar">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search invoices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="filter-select"
            >
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="filter-select"
            >
              {dateOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="no-history">
            <FileText size={48} />
            <h3>No billing history found</h3>
            <p>
              {searchTerm || statusFilter !== 'all' || dateFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'No invoices or payments yet'
              }
            </p>
          </div>
        ) : (
          <div className="billing-history-table">
            <div className="table-header">
              <div className="col">Invoice #</div>
              <div className="col">Description</div>
              <div className="col">Date</div>
              <div className="col">Amount</div>
              <div className="col">Status</div>
              <div className="col">Actions</div>
            </div>
            <div className="table-body">
              <Paged items={filteredHistory}>{(filteredHistory) => filteredHistory.map((item) => (
                <div key={item.id} className="table-row">
                  <div className="col">
                    <span className="invoice-number">
                      {item.invoiceNumber || `INV-${item.id.slice(-8)}`}
                    </span>
                  </div>
                  <div className="col">
                    <span className="description">
                      {item.description || 'Therapy Session'}
                    </span>
                  </div>
                  <div className="col">
                    <span className="date">
                      {formatDate(item.createdAt)}
                    </span>
                  </div>
                  <div className="col">
                    <span className="amount">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                  <div className="col">
                    <span className={`status ${getStatusColor(item.status)}`}>
                      {getStatusIcon(item.status)}
                      {item.status}
                    </span>
                  </div>
                  <div className="col">
                    <div className="row-actions">
                      <button 
                        className="action-btn"
                        onClick={() => downloadInvoice(item)}
                        title="Download Invoice"
                      >
                        <Download size={16} />
                      </button>
                      <button 
                        className="action-btn"
                        title="View Details"
                      >
                        <Eye size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}</Paged>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
