// netlify/functions/generateDigest.js

import { Groq } from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export default async (req, res) => {
  try {
    const { newsletterText } = JSON.parse(req.body);

    const prompt = `
You are an expert newsletter editor. Categorize the following newsletter text into 7 fields:
1. Latest AI News
2. Helpful Articles
3. Full Article Links
4. Free Resources
5. Free Trials
6. New AI Tools
7. Prompt Section

Respond only in JSON format with each field as a key.

TEXT:
${newsletterText}
    `;

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'mixtral-8x7b-32768',
    });

    const aiDigest = completion.choices[0]?.message?.content;

    return res.status(200).json({ digest: aiDigest });
  } catch (error) {
    console.error('Groq API error:', error);
    return res.status(500).json({ error: 'Failed to generate digest' });
  }
};
