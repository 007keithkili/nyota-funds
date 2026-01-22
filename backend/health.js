// api/health.js - Vercel Serverless Function
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'healthy',
      service: 'Nyota Youth Empowerment API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      endpoints: {
        submit: '/api/submit',
        loanOptions: '/api/loan-options',
        health: '/api/health'
      }
    });
  }
  
  return res.status(405).json({
    success: false,
    message: 'Method not allowed'
  });
}