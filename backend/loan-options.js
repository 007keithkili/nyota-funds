// api/loan-options.js - Vercel Serverless Function
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET request
  if (req.method === 'GET') {
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

    // Calculate repayment details for each option
    const optionsWithDetails = loanOptions.map(option => ({
      ...option,
      interest: Math.round(option.amount * 0.1), // 10% interest for 2 months
      repaymentPeriod: '2 months',
      apr: '60%', // Annual Percentage Rate
      totalRepayment: option.amount + option.fee + Math.round(option.amount * 0.1)
    }));

    return res.status(200).json({
      success: true,
      data: optionsWithDetails,
      terms: {
        interestRate: '10% per 2 months',
        processingFee: 'Variable based on amount',
        repaymentPeriod: '2 months',
        eligibility: 'Kenyan citizens aged 18-35 with valid ID and M-Pesa account'
      }
    });
  }

  return res.status(405).json({
    success: false,
    message: 'Method not allowed'
  });
}