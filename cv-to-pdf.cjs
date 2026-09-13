const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const md = fs.readFileSync('/home/nicole/MyGithub/agentic-journal/career/cv/cv-anthropic-security-fellow.md', 'utf-8');

  let html = md
    .replace(/^### (.*)/gm, '<h3>$1</h3>')
    .replace(/^## (.*)/gm, '<h2>$1</h2>')
    .replace(/^# (.*)/gm, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^  - (.*)/gm, '<li class="sub">$1</li>')
    .replace(/^- (.*)/gm, '<li>$1</li>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    // Convert single newlines between bold skill lines to <br> (Technical Skills section)
    .replace(/(<\/strong>[^\n]*)\n(<strong>)/g, '$1<br>\n$2')
    .replace(/\n\n/g, '</p><p>');

  // Wrap consecutive <li> elements in <ul> tags
  html = html.replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, '<ul>$1</ul>');

  const fullHtml = `<!DOCTYPE html><html><head><style>
    @page { margin: 0; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 9.2pt;
      line-height: 1.31;
      margin: 0;
      padding: 0.4in 0.5in;
      color: #1a1a1a;
    }
    h1 {
      font-size: 18pt;
      margin: 0 0 0;
      font-weight: 700;
      color: #111;
    }
    h2 {
      font-size: 10.5pt;
      margin: 8px 0 3px;
      border-bottom: 1.5px solid #333;
      padding-bottom: 1px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #222;
    }
    p {
      margin: 1px 0;
    }
    ul {
      margin: 1px 0;
      padding-left: 14px;
    }
    li {
      margin: 1px 0;
      padding-left: 0;
    }
    li.sub {
      margin-left: 14px;
    }
    hr {
      border: none;
      margin: 3px 0;
    }
    a {
      color: #1565c0;
      text-decoration: none;
    }
    code {
      background: #f4f4f4;
      padding: 0px 2px;
      border-radius: 2px;
      font-size: 8.2pt;
    }
    strong {
      font-weight: 600;
      color: #111;
    }
    em {
      font-style: italic;
      color: #444;
    }
    .entry {
      margin-top: 5px;
    }
    /* Contact line right after h1 */
    h1 + p, h1 + p + p {
      font-size: 8.5pt;
      color: #444;
    }
  </style></head><body>${html}</body></html>`;

  // Add spacing before each job/project entry
  const spaced = fullHtml
    .replace(/<strong>(Backend Engineer|ML Engineer|Data Scientist|Quantitative Developer|Co-author|Activation Probes|Claude Code Organizer)/g,
      '<div class="entry"></div><strong>$1');

  const b = await chromium.launch({ headless: true });
  const page = await b.newPage();
  await page.setContent(spaced, { waitUntil: 'load' });
  await page.pdf({
    path: '/home/nicole/MyGithub/agentic-journal/career/cv/application-drafts/cv-anthropic-security-fellow.pdf',
    format: 'Letter',
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
    printBackground: true
  });
  console.log('PDF saved');
  await b.close();
})();
