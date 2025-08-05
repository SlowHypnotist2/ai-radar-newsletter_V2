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

IMPORTANT: Respond ONLY with valid JSON. Do not wrap in code blocks or add any other text. Return ONLY the JSON object in this exact format:
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
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: "json_object" } // Force JSON response
    });

    const aiResponse = completion.choices[0]?.message?.content;
    console.log('Raw AI Response:', aiResponse); // Debug log
    
    // Clean the response - remove markdown code blocks if present
    let cleanedResponse = aiResponse.trim();
    
    // Remove ```json and ``` if present
    cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    // Remove any text before the first { or after the last }
    const firstBrace = cleanedResponse.indexOf('{');
    const lastBrace = cleanedResponse.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1);
    }
    
    console.log('Cleaned Response:', cleanedResponse); // Debug log
    
    // Try to parse the JSON response
    let parsedDigest;
    try {
      parsedDigest = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      console.error('Failed to parse:', cleanedResponse);
      
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
