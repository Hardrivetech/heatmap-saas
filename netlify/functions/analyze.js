const { MongoClient } = require("mongodb");

const HF_TOKEN = process.env.HF_API_TOKEN;
const MODEL = "google/gemma-1.1-7b-it";
const API_URL = `https://api-inference.huggingface.co/models/${MODEL}`;

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  cachedDb = client.db('heatmap_saas');
  return cachedDb;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const { siteId } = JSON.parse(event.body);
    const db = await connectToDatabase();

    // 1. Get Top Clicked Elements
    const topClicks = await db.collection('events').aggregate([
      { : { siteId: siteId, type: 'click' } },
      { : { _id: "", count: { : 1 } } }, // Group by CSS path
      { : { count: -1 } },
      { : 10 }
    ]).toArray();

    if (topClicks.length === 0) return { statusCode: 200, body: JSON.stringify({ analysis: "No data yet." }) };

    // 2. Format for Gemma
    const summary = topClicks.map(i => `- Element: ${i._id} (${i.count} clicks)`).join('\n');
    
    const prompt = `<start_of_turn>user
You are a UX expert. Analyze this website click data:


1. Which element is most popular?
2. Are there signs of user frustration?
3. Suggest one improvement.<end_of_turn>
<start_of_turn>model`;

    // 3. Call Hugging Face
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer `,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { max_new_tokens: 300, return_full_text: false }
      }),
    });

    const result = await response.json();
    
    // Handle potential loading error or success
    if (result.error) throw new Error(result.error);

    return {
      statusCode: 200,
      body: JSON.stringify({ analysis: result[0].generated_text })
    };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
