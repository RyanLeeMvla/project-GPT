const fs = require('fs');
const https = require('https');

// Read the API key from settings
const settings = JSON.parse(fs.readFileSync('./config/settings.json', 'utf8'));
const apiKey = settings.openai.apiKey;

console.log('🔑 Testing API key:', apiKey.substring(0, 20) + '...');

// Test API call
const data = JSON.stringify({
  model: "gpt-3.5-turbo",
  messages: [{"role": "user", "content": "Say 'API key is working!' if you can respond."}],
  max_tokens: 20
});

const options = {
  hostname: 'api.openai.com',
  port: 443,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let response = '';
  
  res.on('data', (chunk) => {
    response += chunk;
  });
  
  res.on('end', () => {
    try {
      const parsed = JSON.parse(response);
      if (parsed.choices && parsed.choices[0]) {
        console.log('✅ API Response:', parsed.choices[0].message.content);
        console.log('🎉 Your API key is working perfectly!');
      } else if (parsed.error) {
        console.log('❌ API Error:', parsed.error.message);
      }
    } catch (e) {
      console.log('❌ Failed to parse response:', response);
    }
  });
});

req.on('error', (error) => {
  console.log('❌ Request failed:', error.message);
});

req.write(data);
req.end();
