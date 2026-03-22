/**
 * Content cleaning utilities for WordPress/Divi → Astro conversion.
 * Handles both Divi shortcodes ([et_pb_*]) and Gutenberg HTML comments.
 */

// ── Divi shortcode parser ────────────────────────────────────────────

interface DiviBlock {
  tag: string;
  attrs: Record<string, string>;
  innerHtml: string;
  children: DiviBlock[];
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w[\w-]*)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

/**
 * Recursively parse Divi shortcodes into a tree of DiviBlocks.
 */
function parseDivi(input: string): DiviBlock[] {
  const blocks: DiviBlock[] = [];
  // Match opening tags, self-closing tags, and closing tags
  const tagRe = /\[(\/?)(et_pb_\w+)((?:\s+[^[\]]*?)?)\s*(\/?)\]/g;
  const stack: { tag: string; attrs: Record<string, string>; start: number; children: DiviBlock[] }[] = [];
  let lastEnd = 0;

  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(input))) {
    const isClosing = m[1] === '/';
    const tag = m[2];
    const attrStr = m[3] || '';
    const selfClosing = m[4] === '/';
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;

    if (isClosing) {
      // Find matching opening tag on stack
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          const opened = stack.splice(i, 1)[0];
          const innerContent = input.slice(opened.start, matchStart);
          const block: DiviBlock = {
            tag,
            attrs: opened.attrs,
            innerHtml: innerContent,
            children: opened.children,
          };
          if (stack.length > 0) {
            stack[stack.length - 1].children.push(block);
          } else {
            blocks.push(block);
          }
          break;
        }
      }
    } else if (selfClosing) {
      const block: DiviBlock = {
        tag,
        attrs: parseAttrs(attrStr),
        innerHtml: '',
        children: [],
      };
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(block);
      } else {
        blocks.push(block);
      }
    } else {
      // Opening tag
      stack.push({
        tag,
        attrs: parseAttrs(attrStr),
        start: matchEnd,
        children: [],
      });
    }
  }

  return blocks;
}

/**
 * Derive inline style from Divi section/row attributes.
 */
function sectionStyle(attrs: Record<string, string>): string {
  const parts: string[] = [];
  if (attrs.background_color) parts.push(`background-color:${attrs.background_color}`);
  if (attrs.background_image) parts.push(`background-image:url('${attrs.background_image}')`);
  if (attrs.background_position) parts.push(`background-position:${attrs.background_position.replace('_', ' ')}`);
  if (attrs.background_blend) parts.push(`background-blend-mode:${attrs.background_blend}`);
  if (attrs.custom_padding) {
    const p = attrs.custom_padding.split('|').map(v => v === '' || v === 'false' ? '0' : v).slice(0, 4).join(' ');
    parts.push(`padding:${p}`);
  }
  return parts.length ? ` style="${parts.join(';')}"` : '';
}

/**
 * Determine grid class from Divi column_structure attribute.
 */
function gridClass(attrs: Record<string, string>): string {
  const cs = attrs.column_structure || '';
  if (cs.includes('1_3,1_3,1_3')) return 'divi-grid-3';
  if (cs.includes('1_2,1_2')) return 'divi-grid-2';
  if (cs.includes('1_4,3_4') || cs.includes('3_4,1_4')) return 'divi-grid-sidebar';
  if (cs.includes('1_4')) return 'divi-grid-4';
  return '';
}

/**
 * Convert a Divi block tree into clean HTML.
 */
function renderDivi(blocks: DiviBlock[]): string {
  let html = '';

  for (const block of blocks) {
    switch (block.tag) {
      case 'et_pb_section': {
        const style = sectionStyle(block.attrs);
        html += `<section class="divi-section"${style}>\n`;
        html += `<div class="container">\n`;
        html += renderDivi(block.children);
        html += `</div>\n</section>\n`;
        break;
      }

      case 'et_pb_row': {
        const grid = gridClass(block.attrs);
        const cls = grid ? ` class="${grid}"` : '';
        html += `<div${cls}>\n`;
        html += renderDivi(block.children);
        html += `</div>\n`;
        break;
      }

      case 'et_pb_column':
        html += `<div class="divi-col">\n`;
        html += renderDivi(block.children);
        html += `</div>\n`;
        break;

      case 'et_pb_heading': {
        const level = block.attrs.title_level || 'h2';
        const title = block.attrs.title || '';
        if (title) {
          html += `<${level}>${title}</${level}>\n`;
        }
        break;
      }

      case 'et_pb_text':
        html += block.innerHtml.trim() + '\n';
        break;

      case 'et_pb_image': {
        const src = block.attrs.src || '';
        const alt = block.attrs.alt || block.attrs.title_text || '';
        if (src) {
          html += `<img src="${src}" alt="${alt}" />\n`;
        }
        break;
      }

      case 'et_pb_button': {
        const text = block.attrs.button_text || '';
        const url = block.attrs.button_url || '#';
        if (text) {
          html += `<a href="${url}" class="cta-button">${text}</a>\n`;
        }
        break;
      }

      case 'et_pb_blurb': {
        const title = block.attrs.title || '';
        html += `<div class="blurb">\n`;
        if (title) {
          html += `<h3>${title}</h3>\n`;
        }
        html += block.innerHtml.trim() + '\n';
        html += `</div>\n`;
        break;
      }

      case 'et_pb_toggle': {
        const title = block.attrs.title || '';
        html += `<details>\n<summary>${title}</summary>\n`;
        html += block.innerHtml.trim() + '\n';
        html += `</details>\n`;
        break;
      }

      case 'et_pb_divider':
        html += '<hr />\n';
        break;

      case 'et_pb_code':
        // Raw HTML embed (e.g. iframes)
        html += block.innerHtml.trim() + '\n';
        break;

      case 'et_pb_contact_form':
      case 'et_pb_contact_field':
      case 'et_pb_social_media_follow':
      case 'et_pb_social_media_follow_network':
        // Skip dynamic/interactive elements
        break;

      default:
        // Render inner HTML for unknown blocks
        if (block.innerHtml.trim()) {
          html += block.innerHtml.trim() + '\n';
        }
        if (block.children.length > 0) {
          html += renderDivi(block.children);
        }
        break;
    }
  }

  return html;
}

// ── HTML cleaning pipeline ───────────────────────────────────────────

function unescapeJson(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function convertImageUrls(html: string): string {
  // Convert wp-content URLs to local /images/ paths and strip dimension suffixes
  return html.replace(
    /https?:\/\/babu88official\.com\/wp-content\/uploads\/\d{4}\/\d{2}\//g,
    '/images/'
  ).replace(
    /\/images\/([\w.-]+?)-\d+x\d+(\.\w+)/g,
    '/images/$1$2'
  );
}

function convertInternalLinks(html: string): string {
  return html.replace(
    /https?:\/\/babu88official\.com\/?/g,
    '/'
  );
}

function stripWpComments(html: string): string {
  return html.replace(/<!--\s*\/?wp:\S+.*?-->/g, '');
}

function stripSvgs(html: string): string {
  return html.replace(/<svg[\s\S]*?<\/svg>/gi, '');
}

function stripStyleBlocks(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '');
}

function stripSrcset(html: string): string {
  return html.replace(/\s*srcset="[^"]*"/gi, '')
    .replace(/\s*sizes="[^"]*"/gi, '');
}

function stripWpClasses(html: string): string {
  return html.replace(/\s*class="wp-block-[^"]*"/gi, '')
    .replace(/\s*class="wp-image-\d+"/gi, '');
}

function cleanChatGptArtifacts(html: string): string {
  // The about page has ChatGPT response HTML artifacts
  return html.replace(/<div class="flex[^"]*">[\s\S]*?<div class="markdown prose[^"]*">/gi, '')
    .replace(/<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/gi, '');
}

function cleanEmptyTags(html: string): string {
  return html
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<div>\s*<\/div>/gi, '')
    .replace(/<h[1-6][^>]*>\s*<\/h[1-6]>/gi, '')
    .replace(/<figure[^>]*>\s*<\/figure>/gi, '');
}

function normalizeWhitespace(html: string): string {
  return html.replace(/\n{3,}/g, '\n\n').trim();
}

// ── Public API ───────────────────────────────────────────────────────

export function cleanContent(raw: string): string {
  let html = unescapeJson(raw);

  // Detect if content uses Divi shortcodes
  if (html.includes('[et_pb_')) {
    const blocks = parseDivi(html);
    html = renderDivi(blocks);
  }

  html = stripWpComments(html);
  html = stripStyleBlocks(html);
  html = stripSvgs(html);
  html = cleanChatGptArtifacts(html);
  html = convertImageUrls(html);
  html = convertInternalLinks(html);
  html = stripSrcset(html);
  html = stripWpClasses(html);
  html = cleanEmptyTags(html);
  html = normalizeWhitespace(html);

  return html;
}

export function extractH1(html: string): [string, string] {
  const match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (match) {
    const title = match[1].replace(/<[^>]+>/g, '').trim();
    const remaining = html.replace(match[0], '').trim();
    return [title, remaining];
  }
  return ['', html];
}

export function extractDescription(html: string): string {
  const match = html.match(/<p[^>]*>(.*?)<\/p>/i);
  if (match) {
    const text = match[1].replace(/<[^>]+>/g, '').trim();
    return text.slice(0, 200);
  }
  return '';
}

export interface FaqItem {
  question: string;
  answer: string;
}

export function extractFaqs(html: string): FaqItem[] {
  const faqs: FaqItem[] = [];
  // Match <details><summary>Q</summary>A</details> pattern
  const re = /<details>\s*<summary>(.*?)<\/summary>\s*([\s\S]*?)\s*<\/details>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    faqs.push({
      question: m[1].replace(/<[^>]+>/g, '').trim(),
      answer: m[2].trim(),
    });
  }
  return faqs;
}

export function removeFaqFromContent(html: string): string {
  // Remove the FAQ heading and all details/summary blocks that follow
  let cleaned = html.replace(/<h2>Frequently Asked Questions<\/h2>/i, '');
  cleaned = cleaned.replace(/<details>\s*<summary>[\s\S]*?<\/details>/gi, '');
  return cleaned.trim();
}
