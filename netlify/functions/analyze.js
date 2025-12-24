const { MongoClient } = require("mongodb");

// Environment variable for the Google API Key
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
// Using a fast and capable Gemini model. You can also try "gemini-1.5-flash-latest".
const MODEL_NAME = "gemini-3-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GOOGLE_API_KEY}`;

let cachedClient = null;

async function connectToDatabase() {
  if (cachedClient) return cachedClient.db('heatmap_saas');

  const client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });

  await client.connect();
  cachedClient = client;
  return cachedClient.db('heatmap_saas');
}

exports.handler = async (event, context) => {
  // Prevent the function from waiting for the MongoDB connection pool to close
  context.callbackWaitsForEmptyEventLoop = false;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { siteId } = JSON.parse(event.body);
    const db = await connectToDatabase();

    // 1. Get Top Clicked Elements (Corrected Aggregation)
    const topClicks = await db.collection('events').aggregate([
      { $match: { siteId: siteId, type: 'click' } },
      { $group: { _id: "$path", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]).toArray();

    if (topClicks.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ analysis: "Not enough data to analyze yet." }) };
    }

    // 2. Format data for the prompt
    const dataSummary = topClicks
      .map((item, index) => `${index + 1}. Element Selector: "${item._id}" - Clicks: ${item.count}`)
      .join('\n');
    
    // 3. Construct a clean prompt for Gemini
    const prompt = `
You are a world-class UX/UI design consultant.
A client has provided you with click data from their website.
Analyze the following click summary and provide actionable insights.

Click Data:
${dataSummary}

Based on this data, please provide:
1.  **Top Engaged Element:** Identify the element that receives the most user interaction.
2.  **Potential User Frustration:** Look for signs of "rage clicks" (high clicks on non-interactive elements like 'div > span') or confusing navigation patterns.
3.  **Actionable Recommendation:** Suggest one specific, high-impact change to improve user engagement or conversion. Be concise and clear.
`;

    // 4. Call Google Gemini API
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      console.error("Google API Error:", errorBody);
      throw new Error(`Google API Error: ${errorBody.error.message}`);
    }

    const result = await response.json();
    
    // Extract the text from the response
    const analysisText = result.candidates[0].content.parts[0].text;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysis: analysisText })
    };

  } catch (error) {
    console.error("Analysis Function Error:", error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ 
        message: 'An error occurred during analysis.', 
        error: error.message 
      }) 
    };
  }
};
