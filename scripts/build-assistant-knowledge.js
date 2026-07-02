#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'data', 'assistant-knowledge.json');
const ignoredFiles = new Set(['assistant-admin.html']);

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|div|section|article|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function attr(html, name) {
  const match = html.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'));
  return match ? match[1].trim() : '';
}

function getTitle(html, fallback) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : fallback.replace(/\.html$/i, 'Home');
}

function getDescription(html) {
  const match = html.match(/<meta\s+name=["']description["'][^>]*>/i);
  return match ? attr(match[0], 'content') : '';
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function chunkText(text, size = 820, overlap = 120) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    const nextStop = text.slice(start, end).lastIndexOf('. ');
    if (nextStop > size * 0.45 && end < text.length) {
      end = start + nextStop + 1;
    }
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks.filter((chunk) => chunk.length > 80);
}

function readHtmlPages() {
  return fs.readdirSync(root)
    .filter((file) => file.endsWith('.html') && !ignoredFiles.has(file))
    .sort();
}

function buildKnowledge() {
  const pages = readHtmlPages();
  const documents = [];
  const links = [];

  for (const file of pages) {
    const pagePath = path.join(root, file);
    const html = fs.readFileSync(pagePath, 'utf8');
    const title = getTitle(html, file);
    const description = getDescription(html);
    const url = file === 'index.html' ? './index.html' : `./${file}`;
    const headingMatches = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
      .map((match) => stripTags(match[1]));
    const pageLinks = [...html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map((match) => ({
        href: match[1],
        label: stripTags(match[2]),
        page: file
      }))
      .filter((link) => link.href && link.label && !link.href.startsWith('#'));

    links.push(...pageLinks);

    const text = stripTags(html);
    const prefixedText = unique([title, description, ...headingMatches]).join('. ') + '. ' + text;
    chunkText(prefixedText).forEach((chunk, index) => {
      documents.push({
        id: `${file.replace('.html', '')}-${index + 1}`,
        page: file,
        title,
        description,
        url,
        headings: unique(headingMatches).slice(0, 8),
        text: chunk
      });
    });
  }

  const knowledge = {
    generatedAt: new Date().toISOString(),
    source: 'Generated from local website HTML pages by scripts/build-assistant-knowledge.js',
    brand: {
      name: 'GENELLA Visuals',
      phone: '+255 652 240 291',
      whatsapp: 'https://wa.me/255652240291',
      email: 'visuals@genella.co.tz',
      address: 'Green Acres House, 2nd Floor, New Bagamoyo Road, Dar es Salaam, Tanzania',
      instagram: 'https://www.instagram.com/genellavisuals/',
      voice: 'premium creative agency consultant: warm, concise, strategic and helpful'
    },
    pages,
    documents,
    links: unique(links.map((link) => `${link.label}|${link.href}|${link.page}`)).map((item) => {
      const [label, href, page] = item.split('|');
      return { label, href, page };
    })
  };

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(knowledge, null, 2) + '\n');
  console.log(`Built ${documents.length} knowledge chunks from ${pages.length} pages -> ${path.relative(root, output)}`);
}

buildKnowledge();
