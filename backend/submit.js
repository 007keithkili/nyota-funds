// api/submit.js - Vercel Serverless Function
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request (CORS preflight)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Handle POST request
  if (req.method === 'POST') {
    try {
      const { fullName, phoneNumber, idNumber, loanAmount, fee } = req.body;

      // Validate input
      if (!fullName || !phoneNumber) {
        return res.status(400).json({
          success: false,
          message: 'Full name and phone number are required'
        });
      }

      // Generate application ID
      const applicationId = 'NYOTA-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
      
      // Calculate interest (10% for 2 months)
      const amount = parseInt(loanAmount) || 0;
      const processingFee = parseInt(fee) || 0;
      const interest = Math.round(amount * 0.1);
      const totalRepayment = amount + processingFee + interest;

      // Create application record
      const application = {
        applicationId,
        fullName,
        phoneNumber,
        idNumber: idNumber || 'N/A',
        loanAmount: amount,
        processingFee,
        interest,
        totalRepayment,
        status: 'pending',
        submittedAt: new Date().toISOString(),
        estimatedDisbursement: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
      };

      // In production, save to database
      // For now, we'll just return success

      console.log('Application submitted:', {
        applicationId,
        fullName,
        phoneNumber,
        loanAmount: amount,
        timestamp: new Date().toISOString()
      });

      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 500));

      return res.status(200).json({
        success: true,
        message: 'Application submitted successfully',
        data: application
      });

    } catch (error) {
      console.error('Error processing application:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Handle other HTTP methods
  return res.status(405).json({
    success: false,
    message: 'Method not allowed'
  });
}