const jwt = require('jsonwebtoken');

const JWT_SECRET = "<GXALT)b!z1xgGm66K^]_QY82/<BnP*%6{j2|a9_Ebi";

// Sign a valid test JWT token with valid MongoDB ObjectId sub
const token = jwt.sign(
  { sub: '66e2c3a9f1a2b3c4d5e6f7a8', email: 'judge@sih2026.gov.in' },
  JWT_SECRET,
  { expiresIn: '1d' }
);

console.log('Generated JWT Token:\n', token);

async function testWeatherApi(prompt) {
  console.log(`\n==================================================`);
  console.log(`Testing Prompt: "${prompt}"`);
  console.log(`==================================================`);

  const startTime = Date.now();
  try {
    const res = await fetch('http://localhost:5000/weather/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ prompt })
    });

    const status = res.status;
    const data = await res.json();
    const duration = Date.now() - startTime;

    console.log(`Status Code: ${status} (${duration}ms)`);
    console.log(`Response Payload:\n`, JSON.stringify(data, null, 2));

    if (status === 200 && data.answer && data.location && data.weather) {
      console.log(`✅ TEST PASSED for: "${prompt}"`);
    } else {
      console.error(`❌ TEST FAILED for: "${prompt}"`);
    }
  } catch (err) {
    console.error(`❌ NETWORK ERROR:`, err.message);
  }
}

async function runAllTests() {
  await testWeatherApi("I wish to visit Sun Temple near Mehsana on 20th October, is it suitable?");
  await testWeatherApi("Weather at Statue of Unity near Rajpipla");
  await testWeatherApi("Will it rain in Ahmedabad tomorrow?");
  await testWeatherApi("How is the weather in Springfield?");
  await testWeatherApi("Suitability for cricket match in Surat tomorrow?");
}

runAllTests();
