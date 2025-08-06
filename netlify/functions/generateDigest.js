// netlify/functions/generateDigest.js

const { Groq } = require('groq-sdk');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Enhanced timeout fetch wrapper
const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
};

// Enhanced Groq API call with retry logic
const callGroqWithRetry = async (messages, maxRetries = 2) => {
  const models = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']; // Fast model first
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
      const model = models[modelIndex];
      
      try {
        console.log(`Attempt ${attempt + 1}/${maxRetries + 1}, Model: ${model}`);
        
        // Create completion with timeout
        const completion = await Promise.race([
          groq.chat.completions.create({
            messages,
            model,
            temperature: 0.3,
            max_tokens: modelIndex === 0 ? 3000 : 4000, // Fewer tokens for faster model
            response_format: { type: "json_object" }
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Groq API timeout')), 25000)
          )
        ]);

        console.log(`✅ Success with ${model} on attempt ${attempt + 1}`);
        return completion;
        
      } catch (error) {
        console.log(`❌ ${model} failed on attempt ${attempt + 1}:`, error.message);
        
        // If it's the last model and last attempt, continue to next attempt
        if (modelIndex === models.length - 1 && attempt < maxRetries) {
          console.log(`Waiting 2s before retry...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          break;
        }
        
        // If it's the last model and last attempt, throw error
        if (modelIndex === models.length - 1 && attempt === maxRetries) {
          throw error;
        }
        
        // Otherwise, try next model
        continue;
      }
    }
  }
};

// RSS fetching function (enhanced with timeout)
const fetchRSSFeed = async (url, sourceName) => {
  try {
    const response = await fetchWithTimeout(url, {}, 10000); // 10s timeout for RSS
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
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
    console.error(`Error fetching RSS feed ${url}:`, error.message);
    return []; // Return empty array instead of failing
  }
};

// Create fallback digest when AI fails
const createFallbackDigest = (rssContent) => {
  const fallbackDigest = {
    latestNews: [],
    helpfulArticles: [],
    fullArticleLinks: [],
    freeResources: [],
    freeTrials: [],
    newAITools: [],
    promptSection: []
  };
  
  // Distribute content across categories
  rssContent.forEach((item, index) => {
    const categoryIndex = index % 7;
    const categories = Object.keys(fallbackDigest);
    const category = categories[categoryIndex];
    
    fallbackDigest[category].push({
      ...item,
      priority: index < 10 ? "high" : index < 20 ? "medium" : "low"
    });
  });
  
  return fallbackDigest;
};

exports.handler = async (event, context) => {
  // Set function timeout context
  context.callbackWaitsForEmptyEventLoop = false;
  
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

  const startTime = Date.now();
  let rssContent = [];

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
    console.log(`🔄 Fetching RSS feeds from ${sourcesToFetch.length} sources`);

    // Fetch RSS feeds with timeout protection
    const feedPromises = sourcesToFetch.map(source => 
      fetchRSSFeed(source.rssUrl, source.name)
    );
    
    // Use Promise.allSettled to continue even if some feeds fail
    const feedResults = await Promise.allSettled(feedPromises);
    
    // Combine successful RSS content
    let allItems = [];
    feedResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allItems.push(...result.value);
      } else {
        console.warn(`RSS feed ${sourcesToFetch[index].name} failed:`, result.reason?.message);
      }
    });

    // Sort by publication date
    allItems.sort((a, b) => new Date(b.published) - new Date(a.published));
    
    console.log(`✅ Fetched ${allItems.length} RSS items successfully`);

    // Prepare content for AI processing
    rssContent = allItems.slice(0, 25).map(item => ({
      title: item.title,
      summary: item.summary,
      link: item.link,
      source: item.source
    }));

    // Check if we have enough time left for AI processing
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > 20000) { // If more than 20s elapsed
      console.warn('⏰ Running out of time, using fallback digest');
      throw new Error('Function timeout approaching, using fallback');
    }

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
${JSON.stringify(rssContent.slice(0, 20), null, 2)}

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

    console.log('🤖 Sending to Groq AI with enhanced retry logic...');

    // Try AI processing with retry logic
    let parsedDigest;
    try {
      const completion = await callGroqWithRetry([
        { role: 'user', content: prompt }
      ]);

      const aiResponse = completion.choices[0]?.message?.content;
      console.log('✅ Raw AI Response received');
      
      // Clean the response - remove markdown code blocks if present
      let cleanedResponse = aiResponse.trim();
      cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      
      // Remove any text before the first { or after the last }
      const firstBrace = cleanedResponse.indexOf('{');
      const lastBrace = cleanedResponse.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1);
      }
      
      parsedDigest = JSON.parse(cleanedResponse);
      console.log('✅ Successfully parsed AI response');
      
    } catch (aiError) {
      console.warn('⚠️ AI processing failed, using fallback:', aiError.message);
      parsedDigest = createFallbackDigest(rssContent);
    }

    const totalProcessingTime = Date.now() - startTime;
    console.log(`⏱️ Total processing time: ${totalProcessingTime}ms`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true,
        digest: parsedDigest,
        processedAt: new Date().toISOString(),
        totalItems: Object.values(parsedDigest).flat().length,
        processingTimeMs: totalProcessingTime,
        usedFallback: !rssContent.length || Object.values(parsedDigest).flat().length === 0
      }),
    };

  } catch (error) {
    console.error('🚨 Function error:', error);
    
    // Create emergency fallback if we have some RSS content
    let emergencyDigest = null;
    if (rssContent && rssContent.length > 0) {
      emergencyDigest = createFallbackDigest(rssContent);
      console.log('🆘 Created emergency fallback digest');
    }
    
    const totalProcessingTime = Date.now() - startTime;
    
    return {
      statusCode: emergencyDigest ? 200 : 500,
      headers,
      body: JSON.stringify({ 
        success: emergencyDigest ? true : false,
        digest: emergencyDigest,
        error: emergencyDigest ? null : 'Failed to generate digest',
        message: error.message,
        processingTimeMs: totalProcessingTime,
        usedFallback: true,
        fallbackReason: error.message.includes('timeout') ? 'timeout' : 'ai_unavailable'
      }),
    };
  }
};
