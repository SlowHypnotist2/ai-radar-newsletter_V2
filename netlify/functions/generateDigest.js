// netlify/functions/generateDigest.js

const { Groq } = require('groq-sdk');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

exports.handler = async (event, context) => {
  // Handle CORS for browser requests
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { rssContent, focusArea } = JSON.parse(event.body);

    const prompt = `
You are an expert AI newsletter editor. Analyze the following RSS feed content and organize it into exactly 7 categories. 

Focus Area: ${focusArea}

Categorize content into these 7 fields:
1. "latestNews" - Breaking AI news, company announcements, major releases
2. "helpfulArticles" - Educational content, tutorials, how-to guides  
3. "fullArticleLinks" - Extract and verify all article URLs for "read more"
4. "freeResources" - PDFs, templates, downloads, free tools, resources
5. "freeTrials" - Beta access, free trials, limited-time offers
6. "newAITools" - New AI tools, product launches, software releases
7. "promptSection" - AI prompts, prompt engineering tips, prompt libraries

For each category, create an array of items with:
- title: Clear, engaging title
- summary: 2-3 sentence summary
- link: Direct URL to article/resource
- source: Which newsletter this came from
- priority: "high", "medium", or "low"

RSS CONTENT TO PROCESS:
${JSON.stringify(rssContent, null, 2)}

Respond ONLY with valid JSON in this exact format:
{
  "latestNews": [{"title": "...", "summary": "...", "link": "...", "source": "...", "priority": "..."}],
  "helpfulArticles": [{"title": "...", "summary": "...", "link": "...", "source": "...", "priority": "..."}],
  "fullArticleLinks": [{"title": "...", "summary": "...", "link": "...", "source": "...", "priority": "..."}],
  "freeResources": [{"title": "...", "summary": "...", "link": "...", "source": "...", "priority": "..."}],
  "freeTrials": [{"title": "...", "summary": "...", "link": "...", "source": "...", "priority": "..."}],
  "newAITools": [{"title": "...", "summary": "...", "link": "...", "source": "...", "priority": "..."}],
  "promptSection": [{"title": "...", "summary": "...", "link": "...", "source": "...", "priority": "..."}]
}
    `;

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'mixtral-8x7b-32768',
      temperature: 0.3,
      max_tokens: 4000,
    });

    const aiResponse = completion.choices[0]?.message?.content;
    
    // Try to parse the JSON response
    let parsedDigest;
    try {
      parsedDigest = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      // Fallback response if JSON parsing fails
      parsedDigest = {
        latestNews: [{ title: "Processing Error", summary: "Unable to parse AI response", link: "#", source: "System", priority: "low" }],
        helpfulArticles: [],
        fullArticleLinks: [],
        freeResources: [],
        freeTrials: [],
        newAITools: [],
        promptSection: []
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true,
        digest: parsedDigest,
        processedAt: new Date().toISOString(),
        totalItems: Object.values(parsedDigest).flat().length
      }),
    };

  } catch (error) {
    console.error('Groq API error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false,
        error: 'Failed to generate digest',
        message: error.message 
      }),
    };
  }
};
