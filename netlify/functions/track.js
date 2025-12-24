const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const client = await MongoClient.connect(uri);
  cachedDb = client.db('heatmap_saas');
  return cachedDb;
}

exports.handler = async (event, context) => {
  // Prevent the function from waiting for the MongoDB connection pool to close
  context.callbackWaitsForEmptyEventLoop = false;

  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const data = JSON.parse(event.body);
    
    // Basic Validation
    if (!data.siteId || !data.events) return { statusCode: 400, body: 'Invalid Data' };

    const db = await connectToDatabase();
    
    // Prepare data
    const records = data.events.map(e => ({
      siteId: data.siteId,
      url: data.url,
      ...e,
      ingestedAt: new Date()
    }));

    await db.collection('events').insertMany(records);

    return { statusCode: 200, headers, body: JSON.stringify({ status: 'ok' }) };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, headers, body: 'Error' };
  }
};
