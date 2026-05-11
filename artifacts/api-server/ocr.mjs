import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});
const dir = '/tmp/glossary';
const files = fs.readdirSync(dir).filter(f => f.startsWith('chunk_') && f.endsWith('.png')).sort();
const results = await Promise.all(files.map(async (f, i) => {
  const buf = fs.readFileSync(path.join(dir, f));
  const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
  const r = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You extract a glossary of athletic-training terms from an image. Output ONLY the glossary entries verbatim as plain text, one entry per line in the form "Term — definition" (use em dash if no separator visible, otherwise preserve original separator). Preserve every entry faithfully and in order. No commentary, no markdown headers, no numbering you add yourself.' },
      { role: 'user', content: [
        { type: 'text', text: `Extract every glossary entry from this image (chunk ${i+1}/${files.length}).` },
        { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
      ]},
    ],
    max_tokens: 4096,
  });
  const text = r.choices[0]?.message?.content || '';
  console.error(`chunk ${i}: ${text.length} chars`);
  return text;
}));
const combined = results.join('\n');
fs.writeFileSync('/tmp/glossary/extracted.txt', combined);
console.error('TOTAL', combined.length);
