// Test chat functionality
const https = require('https');

async function testChat() {
  console.log('Testing chat API...');
  
  const data = JSON.stringify({
    messages: [
      {
        id: '1',
        role: 'user',
        parts: [{ type: 'text', text: 'Say hello in 5 words exactly' }]
      }
    ],
    modelId: 'gpt-4o',
    conversationId: null,
    source: 'chat'
  });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
    },
    // rejectUnauthorized omitted to enable certificate validation (default is true)
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      console.log(`Status: ${res.statusCode}`);
      console.log(`Headers:`, res.headers);
      
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
        process.stdout.write(chunk);
      });
      
      res.on('end', () => {
        console.log('\n\nFull response received');
        resolve(responseData);
      });
    });

    req.on('error', (error) => {
      console.error('Request error:', error);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

testChat().catch(console.error);