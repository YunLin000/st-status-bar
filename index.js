// ============================================================
// st-status-bar · 状态栏扩展
// v2.0.0：LLM 输出 statusbar JSON 代码块 → 插件捕获解析 → 自己构建可折叠状态栏 DOM
//         （不再让 LLM 输出 HTML，绕开酒馆 markdown/DOMPurify 渲染管线的样式丢失问题）
// 主题/条目全部可在设置面板自定义（默认粉 #ff6b9d）
// ============================================================
import { Popup } from '../../../popup.js';

const MODULE = 'st_status_bar';
const FENCE = 'statusbar';   // LLM 输出的代码块围栏语言标记

// ---------- 默认设置 ----------
const DEFAULTS = {
    enabled: false,
    theme: {
        primary: '#ff6b9d',
        borderStyle: 'solid',   // solid | dashed | dotted
        borderWidth: 1,
        borderRadius: 12,
    },
    character: {
        titleTemplate: '{{name}} · {{age}}',
        items: [
            { key: 'location', label: '地点', rule: '角色当前所在的具体位置' },
            { key: 'mood', label: '情绪', rule: '角色此刻的情绪状态' },
            { key: 'outfit', label: '穿着', rule: '角色当前穿着的衣物款式与颜色' },
            { key: 'body', label: '身体', rule: '角色的身体状态（健康/疲劳/受伤等）' },
            { key: 'thought', label: '想法', rule: '角色当下的内心想法，第三人称，不超过20字' },
        ],
    },
    user: {
        titleTemplate: '{{name}} · {{age}}',
        items: [
            { key: 'location', label: '地点', rule: '仅根据用户最新消息明确写出的位置，未明确填「未明确」' },
            { key: 'mood', label: '情绪', rule: '仅根据用户明确表达的情绪，未明确填「未明确」' },
            { key: 'outfit', label: '穿着', rule: '仅根据用户明确写出的穿着，未明确填「未明确」' },
            { key: 'body', label: '身体', rule: '仅根据用户明确写出的身体状态，未明确填「未明确」' },
            { key: 'thought', label: '想法', rule: '仅根据用户明确表达的内心想法，未明确填「未明确」' },
        ],
    },
};

// ---------- 工具 ----------
function hexToRgbStr(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    if (isNaN(n)) return '255,107,157';
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function lighten(hex, pct) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    if (isNaN(n)) return '#ff9ec4';
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const p = pct / 100;
    const nr = Math.round(r + (255 - r) * p);
    const ng = Math.round(g + (255 - g) * p);
    const nb = Math.round(b + (255 - b) * p);
    return '#' + [nr, ng, nb].map(v => v.toString(16).padStart(2, '0')).join('');
}

function mergeDefaults(target, defaults) {
    for (const k of Object.keys(defaults)) {
        if (!(k in target)) {
            target[k] = structuredClone(defaults[k]);
        } else if (typeof defaults[k] === 'object' && defaults[k] !== null && !Array.isArray(defaults[k]) && !Array.isArray(target[k])) {
            mergeDefaults(target[k], defaults[k]);
        }
    }
    return target;
}

function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    if (!extensionSettings[MODULE]) extensionSettings[MODULE] = {};
    return mergeDefaults(extensionSettings[MODULE], DEFAULTS);
}

function saveSettings() {
    const { saveSettingsDebounced } = SillyTavern.getContext();
    saveSettingsDebounced();
}

// 宽松 JSON 解析：容错 LLM 常见的尾逗号 / 单引号 / 代码块残留
function parseLooseJSON(raw) {
    if (!raw) return null;
    let t = String(raw).trim();
    // 去掉可能的围栏残留
    t = t.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
    // 截取第一个 { 到最后一个 }
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a === -1 || b === -1 || b <= a) return null;
    t = t.slice(a, b + 1);
    try { return JSON.parse(t); } catch (e) { /* 继续修复 */ }
    try {
        const repaired = t
            .replace(/,\s*([}\]])/g, '$1')          // 去尾逗号
            .replace(/([{,]\s*)'([^']*?)'(\s*:)/g, '$1"$2"$3')  // 单引号键
            .replace(/:\s*'([^']*?)'(\s*[,}])/g, ':"$1"$2');    // 单引号值
        return JSON.parse(repaired);
    } catch (e) {
        return null;
    }
}

// TauriTavern 兼容弹窗
async function sbPrompt(title, label, def) {
    try {
        if (Popup && Popup.show) return await Popup.show.input(title, label, def || '');
    } catch (e) { /* 回落 */ }
    return window.prompt(title, def || '');
}
async function sbConfirm(title, text) {
    try {
        if (Popup && Popup.show) return await Popup.show.confirm(title, text);
    } catch (e) { /* 回落 */ }
    return window.confirm(title);
}

// ---------- 主题 CSS 注入 ----------
function injectThemeCSS(s) {
    const t = s.theme;
    const rgb = hexToRgbStr(t.primary);
    const light = lighten(t.primary, 20);
    const css = `
:root{--st-sb-rgb:${rgb};--st-sb-light:${light};}
#chat .mes .mes_text details.st-sb-card{margin:10px 0;background:rgba(128,128,128,.06);background:color-mix(in srgb,var(--SmartThemeBlurTintColor,#888) 10%,transparent);border:${t.borderWidth}px ${t.borderStyle} rgba(${rgb},.22);border-radius:${t.borderRadius}px;overflow:hidden;transition:border-color .3s ease;}
#chat .mes .mes_text details.st-sb-card[open]{background:rgba(128,128,128,.1);background:color-mix(in srgb,var(--SmartThemeBlurTintColor,#888) 16%,transparent);box-shadow:0 2px 10px rgba(${rgb},.12);}
#chat .mes .mes_text details.st-sb-card summary{padding:8px 12px;cursor:pointer;font-size:.9em;font-weight:600;color:${light};user-select:none;display:flex;align-items:center;gap:6px;transition:background .2s;list-style:none;}
#chat .mes .mes_text details.st-sb-card summary::-webkit-details-marker,#chat .mes .mes_text details.st-sb-card summary::marker{display:none;content:"";}
#chat .mes .mes_text details.st-sb-card summary:after{content:"▼";font-size:.8em;margin-left:auto;transition:transform .3s cubic-bezier(.4,0,.2,1);opacity:.6;}
#chat .mes .mes_text details.st-sb-card[open] summary:after{transform:rotate(180deg);}
#chat .mes .mes_text details.st-sb-card .details-content{padding:10px 12px 12px;border-top:1px dashed rgba(${rgb},.2);font-size:.85em;line-height:1.8;color:var(--SmartThemeBodyColor,#333);word-break:break-word;}
#chat .mes .mes_text details.st-sb-card .details-content .st-sb-line{padding:1px 0;}
#chat .mes .mes_text .st-sb-wrap{margin:10px 0;}
/* 未渲染（流式/解析失败）时的原始代码块：弱化显示，不刺眼 */
#chat .mes .mes_text pre:has(> code.language-${FENCE}){opacity:.45;font-size:.8em;}
`;
    let el = document.getElementById('st-status-bar-theme');
    if (!el) {
        el = document.createElement('style');
        el.id = 'st-status-bar-theme';
        document.head.appendChild(el);
    }
    el.textContent = css;
}

// ---------- 状态栏协议提示词（LLM 输出 statusbar JSON 代码块） ----------
function buildProtocol(s) {
    const c = s.character;
    const u = s.user;
    const charRules = c.items.map(i => `- ${i.label}：${i.rule}`).join('\n    ');
    const userRules = u.items.map(i => `- ${i.label}：${i.rule}`).join('\n    ');
    const charStats = c.items.map(i => `{"label":"${i.label}","value":"实际值"}`).join(',');
    const userStats = u.items.map(i => `{"label":"${i.label}","value":"实际值"}`).join(',');

    return `<StatusUpdateProtocol name="StatusBarEngine">
<Purpose>
在回复的【末尾】输出一个 \`\`\`${FENCE} 代码块（内含 JSON），用于追踪和展示当前场景中【所有在场角色】与【用户角色】的实时状态。
这个代码块会被前端自动渲染成可折叠的状态卡片，是沉浸式体验的一部分，属于隐形 UI 元素。
</Purpose>

<OutputFormat>
严格在回复【末尾】输出一个用 \`\`\`${FENCE} 围栏包裹的 JSON（围栏内只放 JSON，不要有其他文字）：
\`\`\`${FENCE}
{"characters":[{"name":"角色实际名字","age":"年龄","stats":[${charStats}]}],"user":{"name":"用户角色名","age":"年龄","stats":[${userStats}]}}
\`\`\`
- characters：数组，每个【在场且非用户的角色】一个对象。
- user：对象，用户扮演的角色，必须有（即使信息很少）。
</OutputFormat>

<CharacterStatusRules>
【角色识别与在场判定】：
1. 分析角色卡/场景设定中【所有登场角色】（一张卡可能含多个角色，如姐妹、家庭、宠物等）。
2. 【绝对禁止】把用户扮演的角色放进 characters 数组——用户只放 user 字段。
3. 扫描最近5轮对话建立在场列表：说话 / 被提及 / 被暗示在场 / 与场景有明确物理在场关系 = 在场。
4. 视为不在场（绝不生成）：从未出现、在其他房间、睡着、已离开、未登场。
5. 每个在场角色在 characters 里占一个独立对象。
【characters[].stats 各字段书写规则】：
    ${charRules}
</CharacterStatusRules>

<UserStatusRules>
【用户状态规则】（user 字段）：
1. 仅使用用户最新消息中明确写出的行为、语言和状态。
2. 不得推测用户未明确表达的心理、情绪、感受、身体反应或动作；缺少依据的项目 value 填「未明确」。
3. 只能整理用户已提供的信息，不能替用户补充或推进任何状态。
【user.stats 各字段书写规则】：
    ${userRules}
</UserStatusRules>

<FinalNotes>
- 把 value 填成【真实的、具体的当前状态描述】，每项不超过20字。
- 状态应反映【当前回复结束时】的最新情况，体现本轮互动中的变化。
- JSON 必须严格合法（双引号、无尾逗号），前端会直接 JSON.parse。
- 【不要】在正文中提及状态栏/代码块的存在，它是隐形 UI 元素。
- 若本回合没有任何在场角色（纯场景描写/独白），characters 可为空数组 []，但 user 字段必须存在。
</FinalNotes>
</StatusUpdateProtocol>`;
}

// ---------- 生成拦截器：把状态栏协议注入对话最深层 ----------
globalThis.stStatusBarInterceptor = async function (chat, contextSize, abort, type) {
    try {
        if (type === 'quiet') return; // 不干扰安静生成（摘要/生图提示词等）
        const s = getSettings();
        if (!s.enabled) return;
        const protocol = buildProtocol(s);
        chat.splice(chat.length - 1, 0, {
            is_user: false,
            name: 'System',
            mes: protocol,
            is_system: true,
        });
    } catch (e) {
        console.error('[st_status_bar] interceptor error:', e);
    }
};

// ---------- 渲染：把 statusbar 代码块替换成状态栏 DOM ----------
function applyTitle(tpl, name, age) {
    return String(tpl || '{{name}} · {{age}}')
        .replace(/\{\{name\}\}/g, name || '')
        .replace(/\{\{age\}\}/g, age || '')
        .replace(/\s*·\s*$/, '')      // 年龄缺失时去掉尾部分隔符
        .trim();
}

function buildCard(entity, sideSettings) {
    const d = document.createElement('details');
    d.className = 'st-sb-card';
    const sum = document.createElement('summary');
    sum.textContent = applyTitle(sideSettings.titleTemplate, entity.name, entity.age);
    const content = document.createElement('div');
    content.className = 'details-content';
    const stats = Array.isArray(entity.stats) ? entity.stats : [];
    for (const st of stats) {
        if (!st) continue;
        const line = document.createElement('div');
        line.className = 'st-sb-line';
        const label = st.label != null ? String(st.label) : '';
        const value = st.value != null ? String(st.value) : '未明确';
        line.textContent = label ? `${label}: ${value}` : value;
        content.appendChild(line);
    }
    d.appendChild(sum);
    d.appendChild(content);
    return d;
}

function buildStatusBarElement(data, s) {
    const wrap = document.createElement('div');
    wrap.className = 'st-sb-wrap';
    // 用户状态栏固定放第一个
    if (data.user) wrap.appendChild(buildCard(data.user, s.user));
    const chars = Array.isArray(data.characters) ? data.characters : [];
    for (const ch of chars) {
        if (!ch) continue;
        wrap.appendChild(buildCard(ch, s.character));
    }
    return wrap;
}

// 在一条消息的 .mes_text 内查找并替换 statusbar 代码块（幂等）
function renderStatusBarIn(mesText, s) {
    if (!mesText) return;
    if (mesText.querySelector('.st-sb-wrap')) return; // 已处理过
    const codes = mesText.querySelectorAll(`pre > code.language-${FENCE}, pre > code[class*="language-${FENCE}"]`);
    for (const code of codes) {
        const data = parseLooseJSON(code.textContent);
        if (!data) continue;
        const el = buildStatusBarElement(data, s);
        const pre = code.closest('pre') || code;
        pre.replaceWith(el);
    }
}

function renderAllStatusBars() {
    try {
        const s = getSettings();
        if (!s.enabled) return;
        document.querySelectorAll('#chat .mes .mes_text').forEach(t => renderStatusBarIn(t, s));
    } catch (e) {
        console.error('[st_status_bar] render error:', e);
    }
}

// ---------- 设置面板：渲染 ----------
async function renderSettingsPanel() {
    const { renderExtensionTemplateAsync } = SillyTavern.getContext();
    try {
        const html = await renderExtensionTemplateAsync('third-party/st-status-bar', 'settings');
        $('#extensions_settings2').append(html);
        bindEvents();
        refreshAllUI();
    } catch (e) {
        console.error('[st_status_bar] render settings error:', e);
    }
}

function refreshAllUI() {
    const s = getSettings();
    $('#sb_enabled').prop('checked', !!s.enabled);
    const t = s.theme;
    $('#sb_color_custom').val(t.primary);
    $('#sb_hex_label').text(t.primary);
    $('#sb_border_width').val(t.borderWidth);
    $('#sb_border_width_val').text(t.borderWidth + 'px');
    $('#sb_border_radius').val(t.borderRadius);
    $('#sb_border_radius_val').text(t.borderRadius + 'px');
    document.querySelectorAll('.sb-style-btn').forEach(b => b.classList.toggle('active', b.dataset.style === t.borderStyle));
    document.querySelectorAll('.sb-swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.hex.toLowerCase() === t.primary.toLowerCase());
    });
    $('#sb_char_title').val(s.character.titleTemplate);
    $('#sb_user_title').val(s.user.titleTemplate);
    renderItemList('character', s.character.items);
    renderItemList('user', s.user.items);
    $('#sb_settings_body').toggleClass('sb-disabled', !s.enabled);
}

function renderItemList(side, items) {
    const box = $(`#sb_items_${side}`);
    if (!box.length) return;
    box.empty();
    items.forEach((it, idx) => {
        const row = $(`
        <div class="sb-item-row" data-idx="${idx}">
            <div class="sb-item-main">
                <div class="sb-item-fields">
                    <input type="text" class="sb-item-label" value="${esc(it.label)}" placeholder="条目名" maxlength="8">
                    <textarea class="sb-item-rule" placeholder="书写规则：这个条目怎么展示、怎么描述">${esc(it.rule)}</textarea>
                </div>
                <div class="sb-item-ops">
                    <button class="menu_button sb-item-up" title="上移"><i class="fa-solid fa-arrow-up"></i></button>
                    <button class="menu_button sb-item-down" title="下移"><i class="fa-solid fa-arrow-down"></i></button>
                    <button class="menu_button sb-item-del" title="删除"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
        </div>`);
        box.append(row);
    });
    if (!items.length) {
        box.append('<div class="sb-empty">（无条目，点下方"添加条目"）</div>');
    }
}

function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- 事件绑定 ----------
function bindEvents() {
    const NS = '.stsb';
    $(document).off(`click${NS} change${NS} input${NS}`);

    $(document).on(`change${NS}`, '#sb_enabled', function () {
        const s = getSettings();
        s.enabled = this.checked;
        saveSettings();
        refreshAllUI();
        if (s.enabled) renderAllStatusBars();
    });

    $(document).on(`click${NS}`, '.sb-swatch', function () {
        const s = getSettings();
        s.theme.primary = this.dataset.hex;
        saveSettings();
        applyTheme();
        refreshAllUI();
    });

    $(document).on(`input${NS}`, '#sb_color_custom', function () {
        const s = getSettings();
        s.theme.primary = this.value;
        $('#sb_hex_label').text(this.value);
        saveSettings();
        applyTheme();
        document.querySelectorAll('.sb-swatch').forEach(sw => sw.classList.toggle('active', sw.dataset.hex.toLowerCase() === this.value.toLowerCase()));
    });

    $(document).on(`click${NS}`, '.sb-style-btn', function () {
        const s = getSettings();
        s.theme.borderStyle = this.dataset.style;
        saveSettings();
        applyTheme();
        document.querySelectorAll('.sb-style-btn').forEach(b => b.classList.toggle('active', b === this));
    });

    $(document).on(`input${NS}`, '#sb_border_width', function () {
        const s = getSettings();
        s.theme.borderWidth = parseInt(this.value);
        $('#sb_border_width_val').text(this.value + 'px');
        saveSettings();
        applyTheme();
    });
    $(document).on(`input${NS}`, '#sb_border_radius', function () {
        const s = getSettings();
        s.theme.borderRadius = parseInt(this.value);
        $('#sb_border_radius_val').text(this.value + 'px');
        saveSettings();
        applyTheme();
    });

    $(document).on(`click${NS}`, '#sb_theme_reset', function () {
        const s = getSettings();
        s.theme = structuredClone(DEFAULTS.theme);
        saveSettings();
        applyTheme();
        refreshAllUI();
    });

    $(document).on(`input${NS}`, '#sb_char_title', function () {
        const s = getSettings();
        s.character.titleTemplate = this.value;
        saveSettings();
    });
    $(document).on(`input${NS}`, '#sb_user_title', function () {
        const s = getSettings();
        s.user.titleTemplate = this.value;
        saveSettings();
    });

    $(document).on(`input${NS}`, '.sb-item-label', function () {
        const { side, idx } = rowInfo(this);
        const s = getSettings();
        if (s[side].items[idx]) s[side].items[idx].label = this.value;
        saveSettings();
    });
    $(document).on(`input${NS}`, '.sb-item-rule', function () {
        const { side, idx } = rowInfo(this);
        const s = getSettings();
        if (s[side].items[idx]) s[side].items[idx].rule = this.value;
        saveSettings();
    });

    $(document).on(`click${NS}`, '.sb-item-up', function () {
        const { side, idx } = rowInfo(this);
        const s = getSettings();
        if (idx > 0) {
            [s[side].items[idx - 1], s[side].items[idx]] = [s[side].items[idx], s[side].items[idx - 1]];
            saveSettings();
            renderItemList(side, s[side].items);
        }
    });
    $(document).on(`click${NS}`, '.sb-item-down', function () {
        const { side, idx } = rowInfo(this);
        const s = getSettings();
        if (idx < s[side].items.length - 1) {
            [s[side].items[idx + 1], s[side].items[idx]] = [s[side].items[idx], s[side].items[idx + 1]];
            saveSettings();
            renderItemList(side, s[side].items);
        }
    });
    $(document).on(`click${NS}`, '.sb-item-del', async function () {
        const { side, idx } = rowInfo(this);
        const ok = await sbConfirm('删除条目', `确定删除「${getSettings()[side].items[idx]?.label || '该条目'}」？`);
        if (!ok) return;
        const s = getSettings();
        s[side].items.splice(idx, 1);
        saveSettings();
        renderItemList(side, s[side].items);
    });

    $(document).on(`click${NS}`, '.sb-item-add', async function () {
        const side = this.dataset.side;
        const name = await sbPrompt('添加条目', '条目名（如：笑容）', '');
        if (!name) return;
        const rule = await sbPrompt('书写规则', '这个条目怎么展示、怎么描述（发给模型）', '填写具体、当下的状态，不超过20字');
        if (rule === null) return;
        const s = getSettings();
        s[side].items.push({ key: 'c' + Date.now(), label: name, rule: rule || '' });
        saveSettings();
        renderItemList(side, s[side].items);
    });

    $(document).on(`click${NS}`, '.sb-card-head', function (e) {
        if ($(e.target).closest('input, textarea, button, .sb-swatch, .sb-style-btn, .sb-item-row').length) return;
        $(this).closest('.sb-panel-card').toggleClass('sb-collapsed');
    });
}

function rowInfo(el) {
    const row = $(el).closest('.sb-item-row')[0];
    const box = $(row).closest('[id^="sb_items_"]');
    const side = box.attr('id').replace('sb_items_', '');
    const idx = parseInt($(row).attr('data-idx'));
    return { side, idx };
}

function applyTheme() {
    injectThemeCSS(getSettings());
}

// ---------- 初始化 ----------
function debounce(fn, ms) {
    let t = null;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

const scheduleRender = debounce(renderAllStatusBars, 120);

(async () => {
    getSettings(); // 初始化默认设置
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.APP_READY, () => {
        applyTheme();
        renderSettingsPanel();
        renderAllStatusBars();
    });
    eventSource.on(event_types.CHAT_CHANGED, () => {
        applyTheme();
        scheduleRender();
    });
    // 新消息渲染完成（流式结束时也走这里）/ 消息编辑更新 → 渲染状态栏
    if (event_types.CHARACTER_MESSAGE_RENDERED) eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, scheduleRender);
    if (event_types.USER_MESSAGE_RENDERED) eventSource.on(event_types.USER_MESSAGE_RENDERED, scheduleRender);
    if (event_types.MESSAGE_UPDATED) eventSource.on(event_types.MESSAGE_UPDATED, scheduleRender);
    // 流式输出结束事件（部分版本）
    if (event_types.STREAM_TOKEN_RECEIVED) { /* 流式中不处理，等渲染完成事件 */ }
})();
