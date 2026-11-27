// Seyir defteri: lib/richText/htmlToMarkdown.ts — TypeScript'ten tipleri soyularak birebir taşındı.
// Web: HTML tarayıcının DOMParser'ıyla ayrıştırılır (mobilde linkedom); script çalıştırmaz,
// görselleri yüklemez (belge etkin değildir)
import TurndownService from 'turndown';
import { copiedMarkdown } from './markdownCopy.js';
const BLOCK_TAGS = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BODY', 'DD', 'DETAILS', 'DIV', 'DL', 'DT',
    'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE', 'TBODY',
    'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
]);
// Yazı biçimi taşımayan, yalnızca içeriği alınan satır içi öğeler
const PLAIN_INLINE_TAGS = new Set([
    'SPAN', 'FONT', 'U', 'INS', 'MARK', 'SMALL', 'BIG', 'SUB', 'SUP', 'ABBR', 'CITE', 'TIME',
    'LABEL', 'BDI', 'BDO', 'KBD', 'SAMP', 'VAR', 'WBR',
]);
const STRIKE_TAGS = new Set(['DEL', 'S', 'STRIKE']);
// Gürültü: içeriği gösterilmeyen ya da düz metne katkısı olmayan öğeler
const NOISE_SELECTOR = [
    'script', 'style', 'noscript', 'template', 'svg', 'math', 'canvas', 'iframe', 'object',
    'embed', 'head', 'meta', 'link', 'title', 'button', 'select', 'textarea', 'audio', 'video',
    'source', 'picture > source', 'clipboard-copy',
].join(',');
const FORMAT_SELECTOR = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 's', 'del', 'strike', 'code',
    'pre', 'ul', 'ol', 'table', 'blockquote', 'a[href]', 'img', 'hr', 'input',
].join(',');
const MONOSPACE = /\b(monospace|courier|consolas|menlo|monaco|source code|fira (code|mono)|jetbrains mono|roboto mono|ubuntu mono|sf mono|cascadia|droid sans mono|inconsolata|lucida console)\b/i;
const SAFE_HREF = /^(https?:|mailto:|tel:)/i;
const UNSAFE_HREF = /^\s*(javascript|vbscript|data|file|blob):/i;
// --- Küçük DOM yardımcıları -------------------------------------------------------------------
function isElement(node) {
    return !!node && node.nodeType === 1;
}
function elementChildren(node) {
    return Array.from(node.childNodes).filter(isElement);
}
// style özniteliğinin bildirimleri: özellik adı → değer (küçük harf). el.style linkedom'da
// güvenilir değil.
export function parseStyle(el) {
    const map = new Map();
    const style = el.getAttribute('style');
    if (!style)
        return map;
    for (const declaration of style.split(';')) {
        const colon = declaration.indexOf(':');
        if (colon === -1)
            continue;
        const prop = declaration.slice(0, colon).trim().toLowerCase();
        const value = declaration.slice(colon + 1).trim().toLowerCase();
        if (prop)
            map.set(prop, value.replace(/\s*!important$/, ''));
    }
    return map;
}
function unwrap(el) {
    const parent = el.parentNode;
    if (!parent)
        return;
    while (el.firstChild)
        parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
}
function remove(node) {
    node.parentNode?.removeChild(node);
}
// El yerine yeni bir öğe koyar, el'in çocukları yeni öğeye geçer
function wrapChildren(el, tag) {
    const wrapper = el.ownerDocument.createElement(tag);
    while (el.firstChild)
        wrapper.appendChild(el.firstChild);
    el.appendChild(wrapper);
    return wrapper;
}
function closestTag(node, tags) {
    let current = node.parentNode;
    while (current) {
        if (isElement(current) && tags.has(current.nodeName))
            return current;
        current = current.parentNode;
    }
    return null;
}
function isBlock(node) {
    return isElement(node) && BLOCK_TAGS.has(node.nodeName);
}
// Boşluktan ibaret yazı düğümlerini atlayarak önceki / sonraki kardeş
function siblingOf(node, direction) {
    let current = node[direction];
    while (current && current.nodeType === 3 && !/\S/.test(current.textContent ?? '')) {
        current = current[direction];
    }
    return current;
}
// --- Ayrıştırma -------------------------------------------------------------------------------
// Panodaki HTML çoğu zaman <html><body><!--StartFragment--> ... <!--EndFragment--> sarmalıyla ya da
// başında <meta charset> ile gelir. Word'ün koşullu yorumları (<![if !supportLists]>) gerçek yorum
// değildir; ayrıştırıcı onları yazı sanmasın diye önceden silinir.
function prepareHtml(html) {
    let source = html;
    const fragment = /<!--\s*StartFragment\s*-->([\s\S]*?)<!--\s*EndFragment\s*-->/i.exec(source);
    if (fragment) {
        source = fragment[1];
    }
    else {
        const body = /<body[^>]*>([\s\S]*?)(<\/body>|$)/i.exec(source);
        if (body)
            source = body[1];
    }
    return source
        .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
        .replace(/<!\[if[^\]]*\]>/gi, '')
        .replace(/<!\[endif\]>/gi, '')
        .replace(/<\/?o:p[^>]*>/gi, '')
        .replace(/<meta[^>]*>/gi, '');
}
export function parseClipboardHtml(html) {
    const document = new DOMParser().parseFromString(`<!doctype html><html><head></head><body>${prepareHtml(html)}</body></html>`, 'text/html');
    return document.body;
}
// --- Normalizasyon ----------------------------------------------------------------------------
// Görünmeyen ve güvensiz olanı atar: script, svg, gizli öğeler, data: görseller
function removeNoise(body) {
    for (const el of Array.from(body.querySelectorAll(NOISE_SELECTOR)))
        remove(el);
    for (const el of Array.from(body.querySelectorAll('[hidden],[aria-hidden="true"],[style]'))) {
        if (!el.parentNode)
            continue;
        const style = parseStyle(el);
        const hidden = el.hasAttribute('hidden') ||
            el.getAttribute('aria-hidden') === 'true' ||
            style.get('display') === 'none' ||
            style.get('visibility') === 'hidden' ||
            (style.has('mso-hide') && style.get('mso-hide') === 'all');
        if (hidden)
            remove(el);
    }
    for (const img of Array.from(body.querySelectorAll('img'))) {
        const src = img.getAttribute('src') ?? '';
        if (!/^https?:\/\//i.test(src))
            remove(img);
    }
    for (const input of Array.from(body.querySelectorAll('input'))) {
        if ((input.getAttribute('type') ?? '').toLowerCase() !== 'checkbox')
            remove(input);
    }
    // Safari'nin ve Chrome'un seçimin sonuna koyduğu satır sonu
    for (const br of Array.from(body.querySelectorAll('br.Apple-interchange-newline')))
        remove(br);
}
// Adresi olmayan (ya da yalnızca sayfa içi / göreli adresi olan) ama yazısı olan linkler. Bunlar
// düz metin olarak eklenir; kullanıcıya kaç tane olduğu söylenir.
export function countLinksWithoutUrl(body) {
    return Array.from(body.querySelectorAll('a')).filter((a) => {
        const href = (a.getAttribute('href') ?? '').trim();
        return !SAFE_HREF.test(href) && !UNSAFE_HREF.test(href) && /\S/.test(a.textContent ?? '');
    }).length;
}
export function normalizeStructure(body) {
    // Google Docs bütün seçimi kalın olmayan bir <b id="docs-internal-guid-..."> içine sarar
    for (const b of Array.from(body.querySelectorAll('b[id^="docs-internal-guid"]')))
        unwrap(b);
    // Güvenli adresi olmayan linkler yazılarıyla kalır
    for (const a of Array.from(body.querySelectorAll('a'))) {
        const href = (a.getAttribute('href') ?? '').trim();
        if (!SAFE_HREF.test(href))
            unwrap(a);
    }
    // <pre> içindeki <br> gerçek satır sonudur
    for (const br of Array.from(body.querySelectorAll('pre br'))) {
        br.parentNode?.replaceChild(body.ownerDocument.createTextNode('\n'), br);
    }
    // Blokların arasında ya da blokların sonunda kalan <br> fazladan "\" satır sonu bırakırdı
    // (Google Docs boş paragrafları bloklar arasına <br> olarak koyar)
    for (const br of Array.from(body.querySelectorAll('br'))) {
        const prev = siblingOf(br, 'previousSibling');
        const next = siblingOf(br, 'nextSibling');
        if (isBlock(prev) || isBlock(next) || !next || (!prev && isBlock(br.parentNode)))
            remove(br);
    }
    // Liste içinde doğrudan duran liste (Google Docs böyle verir) önceki maddenin içine girer
    for (const list of Array.from(body.querySelectorAll('ul > ul, ul > ol, ol > ul, ol > ol'))) {
        const prev = siblingOf(list, 'previousSibling');
        if (isElement(prev) && prev.nodeName === 'LI')
            prev.appendChild(list);
    }
    // Düz bir listede iç içelik yalnızca aria-level ile verilmişse gerçek iç içe listeye dönüşür
    for (const list of Array.from(body.querySelectorAll('ul, ol')))
        nestByAriaLevel(list);
}
function nestByAriaLevel(list) {
    const items = elementChildren(list).filter((el) => el.nodeName === 'LI');
    const levels = items.map((li) => Number(li.getAttribute('aria-level')) || 0);
    if (!levels.some((l) => l > 1))
        return;
    const base = Math.min(...levels.filter((l) => l > 0));
    // Her seviyenin o anki listesi ve son maddesi
    const stack = [
        { level: base, list, last: null },
    ];
    for (let i = 0; i < items.length; i++) {
        const li = items[i];
        const level = Math.max(base, levels[i] || base);
        while (stack.length > 1 && stack[stack.length - 1].level > level)
            stack.pop();
        let top = stack[stack.length - 1];
        if (level > top.level && top.last) {
            const nested = list.ownerDocument.createElement(list.nodeName.toLowerCase());
            top.last.appendChild(nested);
            top = { level, list: nested, last: null };
            stack.push(top);
        }
        if (li.parentNode !== top.list)
            top.list.appendChild(li);
        top.last = li;
    }
}
// Word listeleri gerçek liste değildir: her madde "mso-list:l0 level2 lfo1" stilli bir paragraftır,
// madde işareti de "mso-list:Ignore" stilli bir span'dadır. Ardışık madde paragrafları seviyelerine
// göre iç içe <ul>/<ol>'a çevrilir.
export function normalizeWordLists(body) {
    const isListParagraph = (node) => {
        if (!isElement(node))
            return false;
        const msoList = parseStyle(node).get('mso-list');
        return !!msoList && !/ignore/i.test(msoList) && node.nodeName !== 'LI';
    };
    const visited = new Set();
    for (const start of Array.from(body.querySelectorAll('[style*="mso-list"]'))) {
        if (visited.has(start) || !isListParagraph(start))
            continue;
        // Ardışık madde paragrafları
        const group = [];
        let node = start;
        while (isListParagraph(node)) {
            group.push(node);
            visited.add(node);
            node = siblingOf(node, 'nextSibling');
        }
        const doc = body.ownerDocument;
        const stack = [];
        let root = null;
        for (const p of group) {
            const msoList = parseStyle(p).get('mso-list') ?? '';
            const level = Number(/level(\d+)/i.exec(msoList)?.[1] ?? 1);
            const ignore = p.querySelector('[style*="mso-list"]');
            const marker = (ignore?.textContent ?? '').replace(/\u00A0/g, ' ').trim();
            if (ignore)
                remove(ignore);
            const ordered = /^[0-9a-z]{1,4}[.)]$/i.test(marker);
            while (stack.length > 0 && stack[stack.length - 1].level > level)
                stack.pop();
            let top = stack[stack.length - 1];
            if (!top || top.level < level) {
                const list = doc.createElement(ordered ? 'ol' : 'ul');
                const number = Number(/^(\d+)/.exec(marker)?.[1]);
                if (ordered && number > 1)
                    list.setAttribute('start', String(number));
                if (top?.last)
                    top.last.appendChild(list);
                else if (!root) {
                    root = list;
                    p.parentNode?.insertBefore(list, p);
                }
                else {
                    // Seviyesi ilk maddeden düşük madde: kök listenin yanına yeni bir liste
                    root.parentNode?.insertBefore(list, p);
                    root = list;
                }
                top = { level, list, last: null };
                stack.push(top);
            }
            const li = doc.createElement('li');
            while (p.firstChild)
                li.appendChild(p.firstChild);
            top.list.appendChild(li);
            top.last = li;
            remove(p);
        }
    }
}
const HEADINGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const PRE_LIKE = new Set(['PRE', 'CODE']);
function isBoldWeight(value) {
    if (!value)
        return undefined;
    if (value === 'bold' || value === 'bolder')
        return true;
    if (value === 'normal' || value === 'lighter')
        return false;
    const n = Number(value);
    return Number.isFinite(n) ? n >= 600 : undefined;
}
// Biçimi stilde taşıyan satır içi öğeler gerçek etiketlere çevrilir. Google Docs kalın, italik,
// üstü çizili ve kod yazısını span style'larıyla verir; Word'de kalın <b> olsa da "font-weight:
// normal" stilli <b> da gelir.
export function normalizeInlineStyles(body) {
    for (const el of Array.from(body.querySelectorAll('b, strong, i, em'))) {
        const style = parseStyle(el);
        const bold = el.nodeName === 'B' || el.nodeName === 'STRONG';
        if (bold && isBoldWeight(style.get('font-weight')) === false)
            unwrap(el);
        else if (!bold && style.get('font-style') === 'normal')
            unwrap(el);
    }
    for (const el of Array.from(body.querySelectorAll('span[style], font[style], font[face]'))) {
        if (!el.parentNode || closestTag(el, PRE_LIKE))
            continue;
        const style = parseStyle(el);
        const inHeading = closestTag(el, HEADINGS) !== null;
        const bold = !inHeading && isBoldWeight(style.get('font-weight')) === true;
        const italic = /italic|oblique/.test(style.get('font-style') ?? '');
        const decoration = `${style.get('text-decoration') ?? ''} ${style.get('text-decoration-line') ?? ''}`;
        const strike = decoration.includes('line-through');
        const family = style.get('font-family') ?? el.getAttribute('face') ?? '';
        const code = MONOSPACE.test(family);
        if (!/\S/.test(el.textContent ?? ''))
            continue;
        // İçten dışa: kod en içte, kalın en dışta
        if (code)
            wrapChildren(el, 'code');
        if (strike)
            wrapChildren(el, 's');
        if (italic)
            wrapChildren(el, 'em');
        if (bold)
            wrapChildren(el, 'strong');
    }
}
export function hasFormatting(body) {
    return body.querySelector(FORMAT_SELECTOR) !== null;
}
// Kod editöründen (VS Code vb.) kopyalanan seçim: tek bir "white-space: pre" ve eş aralıklı yazılı
// kap, içinde her satır bir <div> ya da <br>
export function looksLikeCodeEditor(body) {
    const roots = elementChildren(body);
    const strayText = Array.from(body.childNodes).some((n) => n.nodeType === 3 && /\S/.test(n.textContent ?? ''));
    if (roots.length !== 1 || strayText)
        return false;
    const root = roots[0];
    if (root.nodeName === 'PRE')
        return false;
    const style = parseStyle(root);
    return (/^pre/.test(style.get('white-space') ?? '') &&
        MONOSPACE.test(style.get('font-family') ?? '') &&
        root.querySelector('h1,h2,h3,h4,h5,h6,p,ul,ol,table,blockquote') === null);
}
// Kod editörü seçiminin yazısı: her <div> bir satır, <br> boş satır
function codeEditorText(root) {
    const lines = [];
    for (const node of Array.from(root.childNodes)) {
        if (isElement(node) && node.nodeName === 'BR')
            lines.push('');
        else if (isElement(node) && node.nodeName === 'DIV')
            lines.push(node.textContent ?? '');
        else if (/\S/.test(node.textContent ?? ''))
            lines.push(node.textContent ?? '');
    }
    return lines.join('\n');
}
// Kodun içindeki en uzun ` dizisinden uzun bir çit (en az üç)
export function fenceFor(code) {
    const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
    return '`'.repeat(Math.max(3, longest + 1));
}
function fenced(code, language = '') {
    const body = code.replace(/\n$/, '');
    const fence = fenceFor(body);
    return `${fence}${language}\n${body}\n${fence}`;
}
// --- turndown ---------------------------------------------------------------------------------
function codeLanguage(pre, code) {
    const classes = [code, pre, pre.parentNode]
        .map((el) => (isElement(el) ? (el.getAttribute('class') ?? '') : ''))
        .join(' ');
    const match = /(?:^|\s)(?:language|lang|highlight-source|highlight)-([\w#+.-]+)/i.exec(classes);
    const attr = code?.getAttribute('data-language') ??
        pre.getAttribute('data-language') ??
        pre.getAttribute('data-lang') ??
        pre.getAttribute('lang');
    return (match?.[1] ?? attr ?? '').toLowerCase().replace(/[^\w#+.-]/g, '');
}
function tableRows(table) {
    // table.rows yerine: bu tablonun (iç içe tablolarınki değil) satırları
    return Array.from(table.querySelectorAll('tr')).filter((tr) => {
        let parent = tr.parentNode;
        while (parent && parent.nodeName !== 'TABLE')
            parent = parent.parentNode;
        return parent === table;
    });
}
function rowCells(tr) {
    return elementChildren(tr).filter((el) => el.nodeName === 'TD' || el.nodeName === 'TH');
}
function cellAlign(cell) {
    const align = (parseStyle(cell).get('text-align') ?? cell.getAttribute('align') ?? '').toLowerCase();
    if (align === 'center')
        return ':---:';
    if (align === 'right' || align === 'end')
        return '---:';
    if (align === 'left' || align === 'start')
        return ':---';
    return '---';
}
function createService() {
    const service = new TurndownService({
        headingStyle: 'atx',
        hr: '---',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
        fence: '```',
        emDelimiter: '*',
        strongDelimiter: '**',
        linkStyle: 'inlined',
        br: '\\',
    });
    // Madde işareti "- ", numara "1. "; alt satırlar işaretin genişliği kadar içeri girer
    service.addRule('listItem', {
        filter: 'li',
        replacement(content, node) {
            const parent = node.parentNode;
            let prefix = '- ';
            if (parent?.nodeName === 'OL') {
                const start = Number(parent.getAttribute('start')) || 1;
                const index = elementChildren(parent)
                    .filter((el) => el.nodeName === 'LI')
                    .indexOf(node);
                prefix = `${start + Math.max(0, index)}. `;
            }
            const body = content
                .replace(/^\n+/, '')
                .replace(/\n+$/, '\n')
                // Maddenin paragrafından sonra gelen alt liste araya boş satır almaz (Google Docs ve
                // ChatGPT maddeleri <p> içinde verir); boş satır listeyi "gevşek" yapardı
                .replace(/\n{2,}(?=[-*+] |\d+[.)] )/g, '\n')
                .replace(/\n(?=.)/g, `\n${' '.repeat(prefix.length)}`);
            const next = siblingOf(node, 'nextSibling');
            return prefix + body + (next && !/\n$/.test(body) ? '\n' : '');
        },
    });
    service.addRule('strikethrough', {
        filter: (node) => STRIKE_TAGS.has(node.nodeName),
        replacement: (content) => (content.trim() ? `~~${content}~~` : content),
    });
    service.addRule('plainInline', {
        filter: (node) => PLAIN_INLINE_TAGS.has(node.nodeName),
        replacement: (content) => content,
    });
    service.addRule('taskCheckbox', {
        filter: (node) => node.nodeName === 'INPUT' && (node.getAttribute('type') ?? '').toLowerCase() === 'checkbox',
        replacement: (_content, node) => (node.hasAttribute('checked') ? '[x] ' : '[ ] '),
    });
    service.addRule('fencedPre', {
        filter: 'pre',
        replacement(_content, node) {
            const pre = node;
            const code = pre.querySelector('code');
            const text = (code ?? pre).textContent ?? '';
            return `\n\n${fenced(text, codeLanguage(pre, code))}\n\n`;
        },
    });
    service.addRule('table', {
        filter: 'table',
        replacement(content, node) {
            const rows = tableRows(node);
            if (rows.length === 0)
                return content;
            const cellsOf = rows.map(rowCells);
            const matrix = cellsOf.map((cells) => cells.flatMap((cell) => {
                // Hücrenin kendisi verilir; turndown'a string verilirse DOMParser arar
                // GFM tablosunun hücresi tek satırdır: satır sonu <br> olur, paragraflar boşlukla birleşir
                const text = service
                    .turndown(cell)
                    .replace(/\\\n/g, '<br>')
                    .replace(/\n+/g, ' ')
                    .replace(/\|/g, '\\|')
                    .trim();
                const span = Math.max(1, Number(cell.getAttribute('colspan')) || 1);
                return [text, ...Array(span - 1).fill('')];
            }));
            const width = Math.max(...matrix.map((row) => row.length));
            // Tek hücrelik tablo (sayfa düzeni için kullanılan) tablo değildir
            if (width <= 1 && rows.length <= 1)
                return `\n\n${matrix[0]?.[0] ?? ''}\n\n`;
            const pad = (row) => [...row, ...Array(width - row.length).fill('')];
            const line = (row) => `| ${pad(row).join(' | ')} |`;
            const aligns = pad(cellsOf[0].flatMap((cell) => {
                const span = Math.max(1, Number(cell.getAttribute('colspan')) || 1);
                return Array(span).fill(cellAlign(cell));
            })).map((a) => a || '---');
            const lines = [line(matrix[0]), `| ${aligns.join(' | ')} |`, ...matrix.slice(1).map(line)];
            return `\n\n${lines.join('\n')}\n\n`;
        },
    });
    // Tablonun parçaları tablo kuralında işlenir; tek başlarına kaldıklarında yalnızca içerikleri
    service.addRule('tableParts', {
        filter: ['thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col'],
        replacement: (content) => (content.trim() ? ` ${content} ` : ''),
    });
    // turndown "<" işaretini kaçırmaz; yazıdaki "<div>" Markdown'da HTML sanılırdı
    const escape = service.escape.bind(service);
    service.escape = (text) => escape(text).replace(/</g, '\\<');
    return service;
}
let service = null;
function turndown(body) {
    service ??= createService();
    return service.turndown(body);
}
function cleanup(markdown) {
    return markdown
        .replace(/\u00A0/g, ' ')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+$/gm, '')
        .replace(/^(\s*[-*+] )\\?\[( |x)\] {2,}/gim, '$1[$2] ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\n+|\n+$/g, '');
}
// --- Dışa açık API ----------------------------------------------------------------------------
// Yazı HTML etiketi içeriyor mu (düz metin HTML diye verilmiş olabilir)
export function looksLikeHtml(text) {
    return /<\/?[a-z][a-z0-9-]*[\s>/]/i.test(text);
}
export function isBareUrl(text) {
    return /^\s*(https?:\/\/|www\.)\S+\s*$/i.test(text);
}
// Markdown'a çevrilen panodaki yazı. HTML yoksa, tek bir adresse ya da biçim taşımıyorsa düz metin
// olduğu gibi döner (rich: false).
export function clipboardToMarkdown({ html, plain }) {
    // Metin tile'ından / defterden kopyalanan yazı: Markdown'ın kendisi panoda (bkz. markdownCopy.js)
    const copied = copiedMarkdown({ html, plain });
    if (copied !== null)
        return { text: copied, rich: true, missingLinks: 0 };
    const plainText = (plain ?? '').replace(/\r\n?/g, '\n');
    const asPlain = (missingLinks = 0) => ({
        text: plainText,
        rich: false,
        missingLinks,
    });
    if (!html || !/\S/.test(html))
        return asPlain();
    if (plainText && isBareUrl(plainText))
        return { ...asPlain(), text: plainText.trim() };
    const body = parseClipboardHtml(html);
    removeNoise(body);
    if (looksLikeCodeEditor(body)) {
        const code = plainText || codeEditorText(elementChildren(body)[0]);
        return { text: fenced(code), rich: true, missingLinks: 0 };
    }
    const missingLinks = countLinksWithoutUrl(body);
    normalizeStructure(body);
    normalizeWordLists(body);
    normalizeInlineStyles(body);
    if (!hasFormatting(body) && plainText)
        return asPlain(missingLinks);
    const markdown = cleanup(turndown(body));
    if (markdown === '')
        return asPlain(missingLinks);
    return { text: markdown, rich: hasFormatting(body), missingLinks };
}
// Eklenen yazı blok biçimindeyse (başlık, liste, kod, tablo ya da birden çok satır) imlecin önündeki
// ve arkasındaki yazıdan boş bir satırla ayrılır, yoksa Markdown'da önceki paragrafa yapışırdı
export function padForInsertion(text, before, after) {
    const block = text.includes('\n') || /^(#{1,6} |[-*+] |\d+[.)] |> |`{3,}|\|)/.test(text);
    if (!block)
        return text;
    const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const trail = after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    return lead + text + trail;
}
