import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const envPath = path.resolve(process.cwd(), '.env');

async function main() {
  console.log('\n=== Screen To Sheet — Quick Setup ===\n');
  console.log('This helper saves your personal Gemini API key into a private local .env file.');
  console.log('Your .env file is automatically ignored by Git so your key is never shared.\n');
  console.log('Need a key? Get one free at: https://aistudio.google.com/apikey\n');

  const rl = readline.createInterface({ input, output });
  try {
    const apiKey = (await rl.question('Paste your Gemini API key and press Enter: ')).trim();
    if (!apiKey) {
      console.log('\nNo key entered. Cancelled without changes.');
      process.exit(1);
    }

    const content = [
      '# Local environment configuration (ignored by Git)',
      `GEMINI_API_KEY="${apiKey.replace(/"/g, '')}"`,
      'APP_URL="http://localhost:3000"',
      '',
    ].join('\n');

    fs.writeFileSync(envPath, content, 'utf8');
    console.log('\nSaved to .env successfully!');
    console.log('Next step: run "npm run dev" and open http://localhost:3000 in your browser.\n');
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
