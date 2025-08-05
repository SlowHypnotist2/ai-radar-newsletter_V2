// netlify/functions/generateDigest.js

const { Groq } = require('groq-sdk');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// RSS fetching function (server-side)
const fetchRSSFeed = async (url, sourceName) => {
  try {
    // Use fetch directly from server (no CORS issues)
    const response = await fetch(url);
    const xmlText = await response.text();
    
    // Simple XML parsing for RSS feeds
    const items = [];
    const entryMatches = xmlText.match(/<entry[^>]*>[\s\S]*?<\/entry>/g) || [];
    
    entryMatches.slice(0, 8).forEach(entry => {
      const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
      const summaryMatch = entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || 
                          entry.match(/<content[^>]*>([\s\S]*?)<\/content>/);
      const linkMatch = entry.match(/<link[^>]*href="([^"]*)"/) || 
                       entry.match(/<link[^>]*>([^<]*)<\/link>/);
      const publishedMatch = entry.match(/<published[^>]*>([\s\S]*?)<\/published>/) ||
                            entry.match(/<updated[^>]*>([\s\S]*?)<\/updated>/);
      
      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : 'No title';
      const summary = summaryMatch ? summaryMatch[1].replace(/<[^>]*>/g, '').trim().substring(0, 300) + '...' : 'No summary available';
      const link = linkMatch ? linkMatch[1] : '#';
      const published = publishedMatch ? publishedMatch[1] : new Date().toISOString();
      
      items.push({
        title,
        summary,
        link,
        published: new Date(published),
        source: sourceName
      });
    });
    
    return items;
  } catch (error) {
    console.error(`Error fetching RSS feed ${url}:`, error);
    return [];
  }
};

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
    const { focusArea, sources } = JSON.parse(event.body);

    // Default RSS sources if not provided
    const defaultSources = [
      {
        name: "The Rundown University",
        rssUrl: "https://kill-the-newsletter.com/feeds/j3o5qsdo3qyhv731fbsi.xml"
      },
      {
        name: "Superhuman",
        rssUrl: "https://kill-the-newsletter.com/feeds/a46l1m0i8euwqe63m10a.xml"
      },
      {
        name: "AI Fire",
        rssUrl: "https://kill-the-newsletter.com/feeds/zaazvf0he2v851mjk1xi.xml"
      },
      {
        name: "AI Secret",
        rssUrl: "https://kill-the-newsletter.com/feeds/6pvsjo3xm8ysgyfprfbs.xml"
      },
      {
        name: "Future//Proof",
        rssUrl: "https://kill-the-newsletter.com/feeds/6fsx1zjrdbk8pgmqniek.xml"
      },
      {
        name: "AI Essentials",
        rssUrl: "https://kill-the-newsletter.com/feeds/owiptwtkmqlaot94d3k0.xml"
      }
    ];

    const sourcesToFetch = sources || defaultSources;
    console.log('Fetching RSS feeds from', sourcesToFetch.length, 'sources');

    // Fetch all RSS feeds (server-side, no CORS issues)
    const feedPromises = sourcesToFetch.map(source => 
      fetchRSSFeed(source.rssUrl, source.name)
    );
    
    const allFeeds = await Promise.all(feedPromises);
    
    // Combine all RSS content
    let allItems = [];
    allFeeds.forEach(items => {
      allItems.push(...items);
    });

    // Sort by publication date
    allItems.sort((a, b) => new Date(b.published) - new Date(a.published));
    
    console.log('Fetched', allItems.length, 'RSS items');

    // Prepare content for AI processing
    const rssContent = allItems.slice(0, 30).map(item => ({
      title: item.title,
      summary: item.summary,
      link: item.link,
      source: item.source
    }));

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

    console.log('Sending to Groq AI...');

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: "json_object" } // Force JSON response
    });

    const aiResponse = completion.choices[0]?.message?.content;
    console.log('Raw AI Response received');
    
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
    
    // Try to parse the JSON response
    let parsedDigest;
    try {
      parsedDigest = JSON.parse(cleanedResponse);
      console.log('Successfully parsed AI response');
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      
      // Fallback response if JSON parsing fails
      parsedDigest = {
        latestNews: rssContent.slice(0, 5).map(item => ({...item, priority: "high"})),
        helpfulArticles: rssContent.slice(5, 10).map(item => ({...item, priority: "medium"})),
        fullArticleLinks: rssContent.slice(10, 15).map(item => ({...item, priority: "low"})),
        freeResources: rssContent.slice(15, 20).map(item => ({...item, priority: "medium"})),
        freeTrials: rssContent.slice(20, 25).map(item => ({...item, priority: "high"})),
        newAITools: rssContent.slice(25, 30).map(item => ({...item, priority: "high"})),
        promptSection: []
      };
      
      console.log('Using fallback structure due to parsing error');
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
    console.error('Function error:', error);
    
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
