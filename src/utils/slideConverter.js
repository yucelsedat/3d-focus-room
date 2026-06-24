/**
 * Markdown → HTML Slide Deck Converter
 * Uses html-slides skill to generate single-file presentations
 */

const DEFAULT_THEME = 'Obsidian'
const THEMES = ['Obsidian', 'Excalidraw Light', 'Excalidraw Dark', 'Editorial Light', 'Binary Architect']

/**
 * Parse markdown into slides
 * Delimiter: "---" on its own line creates slide break
 */
export function parseMarkdownToSlides(markdown) {
  return markdown
    .split('\n---\n')
    .map((content, idx) => ({
      id: idx,
      content: content.trim(),
      type: 'content' // Will be refined based on content analysis
    }))
    .filter(slide => slide.content.length > 0)
}

/**
 * Detect slide type from content
 */
export function detectSlideType(content) {
  if (content.startsWith('# ') && content.split('\n').length === 1) return 'title'
  if (content.includes('```')) return 'code'
  if (content.includes('|') && content.includes('---')) return 'table'
  if (content.match(/^!\[.*\]\(/)) return 'image'
  if (content.match(/^> /)) return 'quote'
  return 'content'
}

/**
 * Generate HTML slide deck from markdown
 * Returns complete single-file HTML suitable for embedding
 */
export async function markdownToHtmlSlides(markdown, options = {}) {
  const {
    title = 'Presentation',
    theme = DEFAULT_THEME,
    includeCopyButton = true,
  } = options

  const slides = parseMarkdownToSlides(markdown)

  // Build inline CSS with theme colors
  const themeCss = getThemeCss(theme)

  // Build slide HTML
  const slidesHtml = slides
    .map((slide, idx) => {
      const slideType = detectSlideType(slide.content)
      return buildSlideHtml(slide.content, slideType, idx)
    })
    .join('\n')

  // Build complete deck
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #0a0e27;
      color: #e0e0e0;
      overflow: hidden;
    }

    .deck {
      width: 100vw;
      height: 100vh;
      position: relative;
    }

    .slide {
      width: 100%;
      height: 100%;
      display: none;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 60px;
      text-align: center;
      position: relative;
      overflow: hidden;
      animation: slideIn 0.5s ease-out;
    }

    .slide.active { display: flex; }

    @keyframes slideIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    ${themeCss}

    .slide h1 {
      font-size: clamp(2rem, 8vw, 3.5rem);
      margin-bottom: 20px;
      font-weight: 700;
    }

    .slide h2 {
      font-size: clamp(1.5rem, 6vw, 2.5rem);
      margin-bottom: 30px;
    }

    .slide p, .slide li {
      font-size: clamp(1rem, 2vw, 1.3rem);
      line-height: 1.6;
      margin: 10px 0;
    }

    .slide ul {
      list-style: none;
      text-align: left;
      max-width: 800px;
      margin: 0 auto;
    }

    .slide li:before {
      content: "▸ ";
      color: #60a5fa;
      margin-right: 10px;
    }

    .slide code {
      background: rgba(255, 255, 255, 0.1);
      padding: 4px 8px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }

    .slide pre {
      background: rgba(0, 0, 0, 0.4);
      padding: 20px;
      border-radius: 8px;
      overflow-x: auto;
      text-align: left;
      margin: 20px 0;
      max-width: 100%;
    }

    .controls {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 10px;
      z-index: 1000;
    }

    button {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #e0e0e0;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }

    button:hover {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.4);
    }

    .slide-counter {
      position: fixed;
      top: 20px;
      right: 20px;
      font-size: 14px;
      opacity: 0.6;
    }

    ${includeCopyButton ? `
      .copy-btn {
        position: fixed;
        top: 20px;
        left: 20px;
        padding: 6px 12px;
        font-size: 12px;
      }

      .copy-btn.copied {
        background: rgba(34, 197, 94, 0.3);
        border-color: #22c55e;
        color: #22c55e;
      }
    ` : ''}
  </style>
</head>
<body>
  <div class="deck" id="deck">
    ${slidesHtml}
  </div>

  <div class="slide-counter">
    <span id="currentSlide">1</span> / <span id="totalSlides">${slides.length}</span>
  </div>

  <div class="controls">
    <button id="prevBtn">← Önceki</button>
    <button id="nextBtn">Sonraki →</button>
  </div>

  ${includeCopyButton ? '<button class="copy-btn" id="copyBtn">📋 Copy HTML</button>' : ''}

  <script>
    let currentSlide = 0;
    const slides = document.querySelectorAll('.slide');
    const totalSlides = slides.length;

    function updateSlide() {
      slides.forEach((s, i) => {
        s.classList.toggle('active', i === currentSlide);
      });
      document.getElementById('currentSlide').textContent = currentSlide + 1;
    }

    function nextSlide() {
      currentSlide = (currentSlide + 1) % totalSlides;
      updateSlide();
    }

    function prevSlide() {
      currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
      updateSlide();
    }

    document.getElementById('nextBtn').addEventListener('click', nextSlide);
    document.getElementById('prevBtn').addEventListener('click', prevSlide);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') nextSlide();
      if (e.key === 'ArrowLeft') prevSlide();
    });

    ${includeCopyButton ? `
      document.getElementById('copyBtn').addEventListener('click', () => {
        const html = document.documentElement.outerHTML;
        navigator.clipboard.writeText(html).then(() => {
          const btn = document.getElementById('copyBtn');
          btn.classList.add('copied');
          btn.textContent = '✓ Kopyalandı';
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.textContent = '📋 Copy HTML';
          }, 2000);
        });
      });
    ` : ''}

    updateSlide();
  </script>
</body>
</html>`
}

/**
 * Build single slide HTML
 */
function buildSlideHtml(content, type, idx) {
  const html = markdownToHtml(content)

  return `<div class="slide" data-slide="${idx}">
    ${html}
  </div>`
}

/**
 * Simple markdown to HTML converter
 */
function markdownToHtml(markdown) {
  let html = markdown
    // Headers
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
    // Lists
    .replace(/^\* (.*?)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    // Bold & Italic
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>')
    // Inline code
    .replace(/`(.*?)`/g, '<code>$1</code>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/^([^<].*?)$/gm, (match, p) => {
      if (match.match(/^</) || match.match(/^</)) return match
      return `<p>${match}</p>`
    })

  return html
}

/**
 * Get theme CSS
 */
function getThemeCss(theme) {
  const themes = {
    'Obsidian': `
      background: linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 100%);

      .slide h1, .slide h2 { color: #60a5fa; }
      .slide h1 { text-shadow: 0 0 20px rgba(96, 165, 250, 0.3); }
    `,
    'Excalidraw Light': `
      background: #fafaf9;
      color: #1f2937;

      .slide h1, .slide h2 { color: #334155; font-family: 'Comic Sans MS', cursive; }
      .slide { border: 2px solid #cbd5e1; border-radius: 12px; margin: 20px; }
    `,
    'Editorial Light': `
      background: #f8f7f5;
      color: #2c2c2c;

      .slide h1, .slide h2 { color: #1a1a1a; font-family: Georgia, serif; }
    `,
  }

  return themes[theme] || themes['Obsidian']
}

/**
 * Escape HTML special chars
 */
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export default {
  parseMarkdownToSlides,
  markdownToHtmlSlides,
  detectSlideType,
  THEMES,
}
