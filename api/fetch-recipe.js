// pages/api/fetch-recipe.js
// Next.js API Route
import fetch from 'node-fetch';
import { URL } from 'url';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// Optional: Headless rendering with Playwright if enabled
let playwright;
const USE_HEADLESS = process.env.USE_HEADLESS === '1';
if (USE_HEADLESS) {
  try {
    // lazy require to avoid startup cost when not used
    // npm install playwright
    // set env USE_HEADLESS=1 to enable
    // Note: Playwright increases memory/CPU usage
    // and may require additional deployment setup.
    // Only enable if you accept the cost and legal implications.
    // eslint-disable-next-line global-require
    playwright = require('playwright');
  } catch (e) {
    console.warn('Playwright nicht verfügbar, Headless-Fallback deaktiviert.');
  }
}

// Helper: fetch with timeout
async function fetchWithTimeout(url, opts = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// Try oEmbed for known providers
async function tryOEmbed(url) {
  try {
    const u = new URL(url);
