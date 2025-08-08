// netlify/functions/generateDigest.js

const { Groq } = require('groq-sdk');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Enhanced timeout fetch wrapper with cache busting
const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    // Add cache-busting timestamp to URL
    const cacheBustedUrl = url + (url.includes('?') ? '&' : '?') + `t=${Date.now()}&cb=${Math.random()}`;
    console.log(`🔄 Fetching with cache-busting: ${cacheBustedUrl}`);
    
    const response = await fetch(cacheBustedUrl, {
      ...options,
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        ...options.headers
      }
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
        console.log(`🤖 Attempt ${attempt + 1}/${maxRetries + 1}, Model: ${model}`);
        
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
          console.log(`⏳ Waiting 2s before retry...`);
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

// FIXED RSS fetching function with proper XML validation
const fetchRSSFeed = async (url, sourceName) => {
  const startTime = Date.now();
  console.log(`📡 Starting RSS fetch for ${sourceName}: ${url}`);
  
  try {
    const response = await fetchWithTimeout(url, {}, 10000); // 10s timeout for RSS
    
    if (!response.ok) {
      console.error(`❌ HTTP Error for ${sourceName}: ${response.status} ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const responseText = await response.text();
    console.log(`📄 Retrieved content for ${sourceName}: ${responseText.length} characters`);
    
    // Check if response is JSON error instead of XML
    let jsonError = null;
    try {
      const possibleJson = JSON.parse(responseText);
      if (possibleJson.error || possibleJson.message) {
        jsonError = possibleJson;
        console.warn(`⚠️ ${sourceName} returned JSON error:`, jsonError);
      }
    } catch (e) {
      // Good! It's not JSON, should be XML
    }
    
    // If it's a JSON error, return empty array
    if (jsonError) {
      console.warn(`❌ ${sourceName} feed unavailable: ${jsonError.error || jsonError.message}`);
      return [];
    }
    
    // Check if it's actually XML/RSS content
    if (!responseText.includes('<') || (!responseText.includes('<entry') && !responseText.includes('<item'))) {
      console.warn(`❌ ${sourceName} did not return valid RSS/XML content`);
      console.warn(`📄 Content preview: ${responseText.substring(0, 200)}...`);
      return [];
    }
    
    const xmlText = responseText;
    
    // Enhanced XML parsing for both RSS and Atom feeds
    const items = [];
    
    // Try Atom format first (most Kill-the-Newsletter feeds are Atom)
    let entryMatches = xmlText.match(/<entry[^>]*>[\s\S]*?<\/entry>/g) || [];
    let isAtom = true;
    
    // If no Atom entries found, try RSS format
    if (entryMatches.length === 0) {
      entryMatches = xmlText.match(/<item[^>]*>[\s\S]*?<\/item>/g) || [];
      isAtom = false;
    }
    
    console.log(`📰 Found ${entryMatches.length} ${isAtom ? 'Atom entries' : 'RSS items'} for ${sourceName}`);
    
    entryMatches.slice(0, 8).forEach((entry, index) => {
      let title, summary, link, publishedStr;
      
      if (isAtom) {
        // Atom format parsing
        const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
        const summaryMatch = entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || 
                            entry.match(/<content[^>]*>([\s\S]*?)<\/content>/);
        const linkMatch = entry.match(/<link[^>]*href="([^"]*)"/) || 
                         entry.match(/<link[^>]*>([^<]*)<\/link>/);
        const publishedMatch = entry.match(/<published[^>]*>([\s\S]*?)<\/published>/) ||
                              entry.match(/<updated[^>]*>([\s\S]*?)<\/updated>/);
        
        title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : 'No title';
        summary = summaryMatch ? summaryMatch[1].replace(/<[^>]*>/g, '').trim().substring(0, 300) + '...' : 'No summary available';
        link = linkMatch ? linkMatch[1] : '#';
        publishedStr = publishedMatch ? publishedMatch[1] : new Date().toISOString();
      } else {
        // RSS format parsing
        const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
        const descMatch = entry.match(/<description[^>]*>([\s\S]*?)<\/description>/);
        const linkMatch = entry.match(/<link[^>]*>([\s\S]*?)<\/link>/);
        const pubDateMatch = entry.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/);
        
        title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : 'No title';
        summary = descMatch ? descMatch[1].replace(/<[^>]*>/g, '').trim().substring(0, 300) + '...' : 'No summary available';
        link = linkMatch ? linkMatch[1].trim() : '#';
        publishedStr = pubDateMatch ? pubDateMatch[1] : new Date().toISOString();
      }
      
      const publishedDate = new Date(publishedStr);
      const isValidDate = !isNaN(publishedDate.getTime());
      
      // Log each item's date for debugging
      console.log(`  📄 Entry ${index + 1}: "${title.substring(0, 50)}..." - Date: ${publishedDate.toISOString()} (${isValidDate ? 'Valid' : 'Invalid'})`);
      
      items.push({
        title,
        summary,
        link,
        published: isValidDate ? publishedDate : new Date(),
        source: sourceName
      });
    });
    
    // Sort items by date (newest first) and log the date range
    items.sort((a, b) => new Date(b.published) - new Date(a.published));
    
    if (items.length > 0) {
      const newestDate = new Date(items[0].published).toLocaleString();
      const oldestDate = new Date(items[items.length - 1].published).toLocaleString();
      console.log(`📅 Date range for ${sourceName}: ${newestDate} to ${oldestDate}`);
    }
    
    const fetchTime = Date.now() - startTime;
    console.log(`✅ Successfully fetched ${items.length} items from ${sourceName} in ${fetchTime}ms`);
    
    return items;
  } catch (error) {
    const fetchTime = Date.now() - startTime;
    console.error(`❌ Error fetching RSS feed ${sourceName} after ${fetchTime}ms:`, error.message);
    return []; // Return empty array instead of failing
  }
};

// Create fallback digest when AI fails
const createFallbackDigest = (rssContent) => {
  console.log('🔄 Creating fallback digest with', rssContent.length, 'items');
  
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
  
  const totalItems = Object.values(fallbackDigest).flat().length;
  console.log(`✅ Created fallback digest with ${totalItems} items across 7 categories`);
  
  return fallbackDigest;
};

exports.handler = async (event, context) => {
  // Set function timeout context
  context.callbackWaitsForEmptyEventLoop = false;
  
  const functionStartTime = Date.now();
  console.log(`🚀 Function started at: ${new Date().toISOString()}`);
  
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

  let rssContent = [];

  try {
    const requestBody = JSON.parse(event.body);
    console.log('📨 Request body received:', JSON.stringify(requestBody, null, 2));
    
    const { focusArea, sources, rssUrls } = requestBody;

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
    console.log(`📡 Fetching RSS feeds from ${sourcesToFetch.length} sources`);
    console.log('📋 Sources to fetch:', sourcesToFetch.map(s => `${s.name}: ${s.rssUrl}`));

    // Fetch RSS feeds with timeout protection and detailed logging
    const feedPromises = sourcesToFetch.map(source => 
      fetchRSSFeed(source.rssUrl, source.name)
    );
    
    console.log('⏳ Starting parallel RSS feed fetching...');
    const fetchStartTime = Date.now();
    
    // Use Promise.allSettled to continue even if some feeds fail
    const feedResults = await Promise.allSettled(feedPromises);
    
    const fetchEndTime = Date.now();
    console.log(`⏱️ RSS fetching completed in ${fetchEndTime - fetchStartTime}ms`);
    
    // Combine successful RSS content with detailed logging
    let allItems = [];
    feedResults.forEach((result, index) => {
      const sourceName = sourcesToFetch[index].name;
      if (result.status === 'fulfilled') {
        const itemCount = result.value.length;
        allItems.push(...result.value);
        console.log(`✅ ${sourceName}: ${itemCount} items fetched successfully`);
      } else {
        console.error(`❌ ${sourceName}: Failed - ${result.reason?.message}`);
      }
    });

    // Sort by publication date and log the freshest items
    allItems.sort((a, b) => new Date(b.published) - new Date(a.published));
    
    console.log(`📊 Total items fetched: ${allItems.length}`);
    
    if (allItems.length > 0) {
      const freshestItem = allItems[0];
      const oldestItem = allItems[allItems.length - 1];
      console.log(`📅 Content date range:`);
      console.log(`  🆕 Freshest: "${freshestItem.title.substring(0, 50)}..." from ${freshestItem.source} - ${new Date(freshestItem.published).toLocaleString()}`);
      console.log(`  📜 Oldest: "${oldestItem.title.substring(0, 50)}..." from ${oldestItem.source} - ${new Date(oldestItem.published).toLocaleString()}`);
      
      // Check for truly fresh content (within last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const freshItems = allItems.filter(item => new Date(item.published) > oneDayAgo);
      console.log(`🔥 Fresh items (within 24h): ${freshItems.length}/${allItems.length}`);
      
      if (freshItems.length === 0) {
        console.warn('⚠️ WARNING: No items found within the last 24 hours! This might indicate RSS feed issues.');
      }
    }

    // Prepare content for AI processing
    rssContent = allItems.slice(0, 25).map(item => ({
      title: item.title,
      summary: item.summary,
      link: item.link,
      source: item.source,
      published: item.published.toISOString()
    }));

    console.log(`🤖 Preparing ${rssContent.length} items for AI processing`);

    // Check if we have enough time left for AI processing
    const elapsedTime = Date.now() - functionStartTime;
    console.log(`⏱️ Elapsed time before AI processing: ${elapsedTime}ms`);
    
    if (elapsedTime > 20000) { // If more than 20s elapsed
      console.warn('⏰ Running out of time, using fallback digest');
      throw new Error('Function timeout approaching, using fallback');
    }

    const prompt = `
You are an expert AI newsletter editor. Analyze the following RSS feed content and organize it into exactly 7 categories. 

Focus Area: ${focusArea}
Current Date: ${new Date().toISOString()}

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
- priority: "high" (published within 24h), "medium" (published within 48h), or "low" (older)

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
    const aiStartTime = Date.now();

    // Try AI processing with retry logic
    let parsedDigest;
    try {
      const completion = await callGroqWithRetry([
        { role: 'user', content: prompt }
      ]);

      const aiResponse = completion.choices[0]?.message?.content;
      const aiEndTime = Date.now();
      console.log(`✅ Raw AI Response received in ${aiEndTime - aiStartTime}ms`);
      console.log(`📝 AI Response preview: ${aiResponse.substring(0, 200)}...`);
      
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
      
      // Log the distribution of content across categories
      Object.entries(parsedDigest).forEach(([category, items]) => {
        console.log(`📊 ${category}: ${items.length} items`);
      });
      
    } catch (aiError) {
      console.warn('⚠️ AI processing failed, using fallback:', aiError.message);
      parsedDigest = createFallbackDigest(rssContent);
    }

    const totalProcessingTime = Date.now() - functionStartTime;
    console.log(`⏱️ Total processing time: ${totalProcessingTime}ms`);

    const totalItems = Object.values(parsedDigest).flat().length;
    console.log(`📈 Final digest contains ${totalItems} items across ${Object.keys(parsedDigest).length} categories`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true,
        digest: parsedDigest,
        processedAt: new Date().toISOString(),
        totalItems: totalItems,
        processingTimeMs: totalProcessingTime,
        usedFallback: !rssContent.length || totalItems === 0,
        debug: {
          rssItemsFound: allItems.length,
          freshItemsCount: allItems.filter(item => 
            new Date(item.published) > new Date(Date.now() - 24 * 60 * 60 * 1000)
          ).length,
          oldestItemDate: allItems.length > 0 ? new Date(allItems[allItems.length - 1].published).toISOString() : null,
          newestItemDate: allItems.length > 0 ? new Date(allItems[0].published).toISOString() : null
        }
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
    
    const totalProcessingTime = Date.now() - functionStartTime;
    
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
        fallbackReason: error.message.includes('timeout') ? 'timeout' : 'ai_unavailable',
        debug: {
          functionStartTime: new Date(functionStartTime).toISOString(),
          errorTime: new Date().toISOString()
        }
      }),
    };
  }
};
