import React, { useState } from 'react';
import './App.css';

function App() {
    const [sources, setSources] = useState([
        {
            id: 1,
            name: "The Rundown University",
            rssUrl: "https://kill-the-newsletter.com/feeds/j3o5qsdo3qyhv731fbsi.xml",
            status: "active",
            lastUpdate: "2 hours ago"
        },
        {
            id: 2,
            name: "Superhuman",
            rssUrl: "https://kill-the-newsletter.com/feeds/a46l1m0i8euwqe63m10a.xml",
            status: "active",
            lastUpdate: "3 hours ago"
        },
        {
            id: 3,
            name: "AI Fire",
            rssUrl: "https://kill-the-newsletter.com/feeds/zaazvf0he2v851mjk1xi.xml",
            status: "active",
            lastUpdate: "1 hour ago"
        },
        {
            id: 4,
            name: "AI Secret",
            rssUrl: "https://kill-the-newsletter.com/feeds/6pvsjo3xm8ysgyfprfbs.xml",
            status: "active",
            lastUpdate: "4 hours ago"
        },
        {
            id: 5,
            name: "Future//Proof",
            rssUrl: "https://kill-the-newsletter.com/feeds/6fsx1zjrdbk8pgmqniek.xml",
            status: "active",
            lastUpdate: "5 hours ago"
        },
        {
            id: 6,
            name: "AI Essentials",
            rssUrl: "https://kill-the-newsletter.com/feeds/owiptwtkmqlaot94d3k0.xml",
            status: "active",
            lastUpdate: "6 hours ago"
        }
    ]);

    const [newEmail, setNewEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [digest, setDigest] = useState(null);
    const [selectedPrompt, setSelectedPrompt] = useState('actionable');

    const promptTemplates = {
        actionable: {
            title: "🎯 Focus on Actionable Tools",
            description: "Prioritize tools and products I can use immediately"
        },
        business: {
            title: "📊 Business & Investment Focus",
            description: "Highlight funding, acquisitions, and business opportunities"
        },
        research: {
            title: "🔬 Research & Breakthroughs",
            description: "Focus on scientific advances and technical innovations"
        },
        safety: {
            title: "🛡️ Safety & Regulation",
            description: "Emphasize AI safety, ethics, and regulatory developments"
        },
        creative: {
            title: "💡 Creative & Content Tools",
            description: "Highlight tools for content creation and creative work"
        },
        industry: {
            title: "🏥 Industry Applications",
            description: "Focus on AI applications in specific industries"
        }
    };

    // RSS Fetching Function
    const fetchRSSFeed = async (url) => {
        try {
            // Use CORS proxy to fetch RSS feeds
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl);
            const data = await response.json();
            
            // Parse XML content
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(data.contents, 'text/xml');
            
            // Extract items from RSS feed
            const items = Array.from(xmlDoc.querySelectorAll('entry')).map(item => {
                const title = item.querySelector('title')?.textContent || 'No title';
                const summary = item.querySelector('summary')?.textContent || 'No summary available';
                const link = item.querySelector('link')?.getAttribute('href') || '#';
                const published = item.querySelector('published')?.textContent || new Date().toISOString();
                
                return {
                    title: title.trim(),
                    summary: summary.trim().substring(0, 300) + '...',
                    link,
                    published: new Date(published)
                };
            });
            
            return items.slice(0, 8); // Get latest 8 items per source
        } catch (error) {
            console.error('Error fetching RSS feed:', error);
            return [];
        }
    };

    // Generate Digest with AI Processing
    const generateDigest = async () => {
        setIsLoading(true);
        
        try {
            // Get active sources
            const activeSources = sources.filter(s => s.status === 'active');
            
            // Fetch all RSS feeds
            const feedPromises = activeSources.map(async (source) => {
                const items = await fetchRSSFeed(source.rssUrl);
                return {
                    sourceName: source.name,
                    items: items
                };
            });
            
            const allFeeds = await Promise.all(feedPromises);
            
            // Combine all RSS content
            let allItems = [];
            allFeeds.forEach(feed => {
                feed.items.forEach(item => {
                    allItems.push({
                        ...item,
                        source: feed.sourceName
                    });
                });
            });
            
            // Sort by publication date
            allItems.sort((a, b) => new Date(b.published) - new Date(a.published));
            
            // Call Netlify function with Groq AI processing
            const response = await fetch('/.netlify/functions/generateDigest', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    rssContent: allItems,
                    focusArea: promptTemplates[selectedPrompt].title
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Organize AI processed content into display format
                const aiDigest = result.digest;
                
                // Map the 7 AI categories to display sections
                const sections = [
                    {
                        title: "🔥 Latest AI News",
                        items: aiDigest.latestNews || []
                    },
                    {
                        title: "📚 Helpful Articles", 
                        items: aiDigest.helpfulArticles || []
                    },
                    {
                        title: "🔗 Full Article Links",
                        items: aiDigest.fullArticleLinks || []
                    },
                    {
                        title: "🎁 Free Resources",
                        items: aiDigest.freeResources || []
                    },
                    {
                        title: "🆓 Free Trials",
                        items: aiDigest.freeTrials || []
                    },
                    {
                        title: "🛠️ New AI Tools",
                        items: aiDigest.newAITools || []
                    },
                    {
                        title: "💡 Prompt Section",
                        items: aiDigest.promptSection || []
                    }
                ];
                
                const processedDigest = {
                    title: `🤖 Manpreet's AI Digest - ${new Date().toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    })}`,
                    summary: "AI-powered digest from your RSS feeds, organized into 7 focused sections",
                    sections: sections.filter(section => section.items.length > 0),
                    metadata: {
                        sources: activeSources.length,
                        articlesProcessed: result.totalItems || allItems.length,
                        readingTime: Math.ceil((result.totalItems || allItems.length) * 0.3) + " min",
                        generatedAt: new Date().toLocaleString(),
                        focusArea: promptTemplates[selectedPrompt].title,
                        aiProcessed: true
                    }
                };
                
                setDigest(processedDigest);
                
            } else {
                throw new Error(result.message || 'AI processing failed');
            }
            
        } catch (error) {
            console.error('Error generating digest:', error);
            
            // Fallback to basic processing if AI fails
            const activeSources = sources.filter(s => s.status === 'active');
            const mockDigest = {
                title: `🤖 Manpreet's AI Digest - ${new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric', 
                    month: 'long',
                    day: 'numeric'
                })}`,
                summary: "AI processing temporarily unavailable - showing basic RSS content",
                sections: [
                    {
                        title: "🔥 Latest Content from RSS Feeds",
                        items: [
                            {
                                title: "AI Processing Error - RSS Feeds Loading",
                                source: "System",
                                summary: "There was an issue with AI processing. Please try again. Your RSS feeds are connected and working.",
                                link: "#",
                                priority: "high"
                            }
                        ]
                    }
                ],
                metadata: {
                    sources: activeSources.length,
                    articlesProcessed: 1,
                    readingTime: "1 min",
                    generatedAt: new Date().toLocaleString(),
                    focusArea: promptTemplates[selectedPrompt].title,
                    aiProcessed: false
                }
            };
            
            setDigest(mockDigest);
        }
        
        setIsLoading(false);
    };

    const addSource = () => {
        if (newEmail && newEmail.includes('@')) {
            const newSource = {
                id: Date.now(),
                name: newEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                email: newEmail,
                status: "active",
                lastUpdate: "Just added"
            };
            setSources([...sources, newSource]);
            setNewEmail('');
        }
    };

    const toggleSourceStatus = (id) => {
        setSources(sources.map(source =>
            source.id === id
                ? { ...source, status: source.status === 'active' ? 'inactive' : 'active' }
                : source
        ));
    };

    const removeSource = (id) => {
        setSources(sources.filter(source => source.id !== id));
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 font-inter">
            <div className="container mx-auto px-6 py-8 max-w-7xl">

                {/* Header */}
                <header className="text-center mb-12">
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <span className="text-4xl animate-pulse">✨</span>
                        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent leading-tight py-2">
                            Manpreet's AI Digest
                        </h1>
                    </div>
                    <p className="text-xl text-gray-300 mb-2">
                        Your personalized AI newsletter, powered by Groq AI
                    </p>
                    <p className="text-gray-400">
                        Consolidates {sources.filter(s => s.status === 'active').length} daily newsletters into one focused digest • Saves ~45 minutes daily
                    </p>
                </header>

                {/* Email Sources Section */}
                <section className="mb-12">
                    <div className="flex items-center gap-3 mb-6">
                        <span className="text-2xl">📡</span>
                        <h2 className="text-2xl md:text-3xl font-bold text-white">Connected RSS Sources</h2>
                        <span className="bg-green-500 text-white px-2 py-1 rounded-full text-xs font-semibold">
                            {sources.filter(s => s.status === 'active').length} Active
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                        {sources.map((source) => (
                            <div
                                key={source.id}
                                className={`relative group p-6 rounded-xl backdrop-blur-lg border transition-all duration-300 hover:transform hover:scale-105 hover:shadow-2xl cursor-pointer ${source.status === 'active'
                                    ? 'bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/50 shadow-green-500/20'
                                    : 'bg-gradient-to-br from-gray-500/20 to-gray-600/10 border-gray-500/50 shadow-gray-500/20'
                                    } shadow-lg`}
                                onClick={() => toggleSourceStatus(source.id)}
                            >
                                {/* Remove button for custom sources */}
                                {source.id > 6 && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeSource(source.id);
                                        }}
                                        className="absolute top-2 right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center"
                                    >
                                        ×
                                    </button>
                                )}

                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center">
                                        <span className={`w-3 h-3 rounded-full mr-3 ${source.status === 'active' ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-gray-500'
                                            }`}></span>
                                        <h3 className="font-semibold text-white text-sm md:text-base">{source.name}</h3>
                                    </div>
                                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${source.status === 'active' ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'
                                        }`}>
                                        {source.status.toUpperCase()}
                                    </span>
                                </div>
                                <p className="text-gray-300 text-xs mb-2 truncate font-mono">RSS Feed Active</p>
                                <p className="text-gray-400 text-xs">Last: {source.lastUpdate}</p>
                            </div>
                        ))}
                    </div>

                    {/* Add New Source */}
                    <div className="bg-white/5 backdrop-blur-lg border border-white/20 p-6 rounded-xl shadow-xl">
                        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                            <span>➕</span>
                            Add New Newsletter Source
                        </h3>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <input
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder="newsletter@example.com"
                                className="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/30 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all duration-200"
                            />
                            <button
                                onClick={addSource}
                                disabled={!newEmail || !newEmail.includes('@')}
                                className="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-200 hover:shadow-lg hover:transform hover:scale-105"
                            >
                                Add Source
                            </button>
                        </div>
                    </div>
                </section>

                {/* AI Prompt Customization */}
                <section className="mb-12">
                    <div className="flex items-center gap-3 mb-6">
                        <span className="text-2xl">🎯</span>
                        <h2 className="text-2xl md:text-3xl font-bold text-white">Customize Your Focus</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(promptTemplates).map(([key, template]) => (
                            <button
                                key={key}
                                onClick={() => setSelectedPrompt(key)}
                                className={`p-4 rounded-xl text-left transition-all duration-300 hover:transform hover:scale-105 ${selectedPrompt === key
                                    ? 'bg-gradient-to-br from-blue-500/30 to-purple-600/20 border-2 border-blue-500 shadow-lg shadow-blue-500/25'
                                    : 'bg-white/5 backdrop-blur-lg border border-white/20 hover:bg-white/10 hover:border-white/30'
                                    }`}
                            >
                                <h3 className="font-semibold text-white mb-2 text-sm md:text-base">{template.title}</h3>
                                <p className="text-gray-300 text-xs md:text-sm leading-relaxed">{template.description}</p>
                            </button>
                        ))}
                    </div>
                </section>

                {/* Generate Digest */}
                <section className="mb-12">
                    <div className="text-center">
                        <button
                            onClick={generateDigest}
                            disabled={isLoading}
                            className="group px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold rounded-xl text-lg md:text-xl transition-all duration-300 hover:shadow-2xl hover:transform hover:scale-105 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
                        >
                            {isLoading ? (
                                <span className="flex items-center gap-3">
                                    <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    Processing with AI...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    🚀 Generate My AI Digest
                                    <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
                                </span>
                            )}
                        </button>

                        {selectedPrompt && !isLoading && (
                            <p className="mt-3 text-gray-400 text-sm">
                                Focus: {promptTemplates[selectedPrompt].title} • Powered by Groq AI
                            </p>
                        )}
                    </div>
                </section>

                {/* Digest Display */}
                {digest && (
                    <section className="bg-white/5 backdrop-blur-lg border border-white/20 rounded-xl shadow-2xl overflow-hidden animate-fadeInUp">
                        {/* Digest Header */}
                        <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 p-8 text-center border-b border-white/10">
                            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">{digest.title}</h2>
                            <p className="text-gray-300 mb-4 text-sm md:text-base">{digest.summary}</p>
                            <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 text-xs md:text-sm text-gray-400">
                                <span className="flex items-center gap-1">📡 {digest.metadata.sources} RSS Sources</span>
                                <span className="flex items-center gap-1">📄 {digest.metadata.articlesProcessed} Articles</span>
                                <span className="flex items-center gap-1">⏱️ {digest.metadata.readingTime} Read</span>
                                <span className="flex items-center gap-1">🎯 {digest.metadata.focusArea}</span>
                                {digest.metadata.aiProcessed && (
                                    <span className="flex items-center gap-1 text-green-400">🤖 AI Processed</span>
                                )}
                            </div>
                            <p className="text-gray-500 text-xs mt-2">Generated: {digest.metadata.generatedAt}</p>
                        </div>

                        {/* Digest Content */}
                        <div className="p-8">
                            {digest.sections.map((section, index) => (
                                <div key={index} className="mb-10 last:mb-0">
                                    <h3 className="text-xl md:text-2xl font-bold text-white mb-6 pb-2 border-b border-white/10">
                                        {section.title}
                                    </h3>
                                    <div className="space-y-6">
                                        {section.items.map((item, itemIndex) => (
                                            <div
                                                key={itemIndex}
                                                className={`group p-6 rounded-lg bg-white/5 border-l-4 transition-all duration-300 hover:bg-white/10 hover:transform hover:translate-x-2 ${item.priority === 'high' ? 'border-l-red-500' :
                                                    item.priority === 'medium' ? 'border-l-yellow-500' :
                                                        'border-l-green-500'
                                                    }`}
                                            >
                                                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                                                    <div className="flex-1">
                                                        <h4 className="font-semibold text-white mb-3 text-base md:text-lg leading-tight hover:text-blue-400 transition-colors duration-200">
                                                            <a href={item.link} target="_blank" rel="noopener noreferrer" className="group-hover:underline">
                                                                {item.title}
                                                            </a>
                                                        </h4>
                                                        <p className="text-gray-300 mb-4 leading-relaxed text-sm md:text-base">{item.summary}</p>
                                                        <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm">
                                                            <span className="flex items-center gap-1 text-blue-400 font-medium">
                                                                📰 {item.source}
                                                            </span>
                                                            <span className={`px-3 py-1 rounded-full font-semibold ${item.priority === 'high' ? 'bg-red-900/50 text-red-300 border border-red-500/50' :
                                                                item.priority === 'medium' ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-500/50' :
                                                                    'bg-green-900/50 text-green-300 border border-green-500/50'
                                                                }`}>
                                                                {item.priority.toUpperCase()} PRIORITY
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Digest Footer */}
                        <div className="bg-gradient-to-r from-gray-800/50 to-gray-900/50 p-6 text-center border-t border-white/10">
                            <p className="text-gray-400 text-sm">
                                ✨ Generated with Groq AI • Organized into 7 focused sections •
                                <span className="text-blue-400 font-medium ml-1">Save 45+ minutes daily</span>
                            </p>
                            <div className="mt-3 flex justify-center gap-4 text-xs text-gray-500">
                                <span>🤖 AI Processed</span>
                                <span>•</span>
                                <span>📱 Mobile optimized</span>
                                <span>•</span>
                                <span>🎯 Personalized content</span>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}

export default App;
