// ============================================================
// st-status-bar · 状态栏扩展（PiuPiu 式）
// 让 LLM 在回复末尾生成 <details class="st-sb-card"> 可折叠状态栏，追踪在场角色与用户的实时状态
// 主题/条目全部可在设置面板自定义（默认粉 #ff6b9d 照搬 PiuPiu ChatView 样式）
// ============================================================
import { Popup } from '../../../popup.js';

const MODULE = 'st_status_bar';

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

// 深合并默认值（对象递归，数组直接替换）
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

// TauriTavern 兼容弹窗（原生 prompt/confirm 在安卓 WebView 静默返回 null）
async function sbPrompt(title, label, def) {
    try {
        if (Popup && Popup.show) {
            return await Popup.show.input(title, label, def || '');
        }
    } catch (e) { /* 回落原生 */ }
    return window.prompt(title, def || '');
}
async function sbConfirm(title, text) {
    try {
        if (Popup && Popup.show) {
            return await Popup.show.confirm(title, text);
        }
    } catch (e) { /* 回落原生 */ }
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
`;
    let el = document.getElementById('st-status-bar-theme');
    if (!el) {
        el = document.createElement('style');
        el.id = 'st-status-bar-theme';
        document.head.appendChild(el);
    }
    el.textContent = css;
}

// ---------- 状态栏协议提示词（照搬 PiuPiu 服务端模板结构） ----------
function buildProtocol(s) {
    const c = s.character;
    const u = s.user;
    const charTpl = c.items.map(i => `${i.label}: [${i.label}]`).join('<br>');
    const charRules = c.items.map(i => `- ${i.label}：${i.rule}`).join('<br>');
    const userTpl = u.items.map(i => `${i.label}: [${i.label}]`).join('<br>');
    const userRules = u.items.map(i => `- ${i.label}：${i.rule}`).join('<br>');

    return `<StatusUpdateProtocol name="DynamicCharacterStatusEngine">
    <Purpose>
    在回复的【末尾】生成HTML格式的可折叠状态栏，用于追踪和展示当前场景中【所有非用户角色】的实时状态。
    此状态栏是沉浸式体验的一部分，让读者能直观感知每个角色的当前情况。
    </Purpose>
    <SettingsIntegration>
    【状态栏标题模板】（放在 <summary> 标签内，替换占位符为实际值）：
    ${c.titleTemplate}
    【状态项模板】（每行一项，将 [占位符] 替换为实际状态值）：
    ${charTpl}
    【各项书写规则】：
    ${charRules}
    </SettingsIntegration>
    <MultiCharacterRules>
    【角色识别规则】：
    1. 仔细分析角色卡/场景设定中包含的【所有登场角色】。
    2. 一张角色卡可能包含多个角色（如一个角色和她的宠物、一对姐妹、一个家庭等）。
    3. 【绝对禁止】为【用户扮演的角色】生成此状态栏。
    4. 只为【AI扮演的NPC/角色】生成状态栏。
    【当前在场判定规则】（极为重要）：
    - 扫描最近5轮对话，建立在场角色列表。
    - 视为在场：最近对话中说话、被提及、被暗示在场、与场景有明确物理在场关系的角色。
    - 视为不在场（绝不生成）：从未在对话中出现过、在其他房间、睡着、已离开、未登场的角色。
    【单角色场景】：
    - 标题使用状态栏标题模板（自动替换 {{name}} 为角色名、{{age}} 为角色年龄）。
    - 生成【一个】状态栏。
    【多角色场景】：
    - 为【每个在场角色】分别生成【独立的】状态栏。
    - 每个状态栏使用独立的 <details class="st-sb-card"> 标签包裹。
    - <summary> 标签内的标题必须是【该角色的实际名字】，而非角色卡名称。
    - 每个角色的状态项仍参考状态项模板，但标题用角色名替换。
    </MultiCharacterRules>
    <HTMLFormat>
    严格遵循以下HTML格式，确保前端能正确渲染：
    【单角色标准格式】：
    <details class="st-sb-card">
    <summary>${c.titleTemplate}</summary>
    <div class="details-content">
    ${charTpl}
    </div>
    </details>
    【多角色格式示例】：
    <details class="st-sb-card">
    <summary>😊 角色A实际名字</summary>
    <div class="details-content">
    [参考状态项模板填充角色A的状态]
    </div>
    </details>
    <details class="st-sb-card">
    <summary>🌙 角色B实际名字</summary>
    <div class="details-content">
    [参考状态项模板填充角色B的状态]
    </div>
    </details>
    </HTMLFormat>
    <FinalNotes>
    - 将模板中的 [占位符] 替换为【真实的、具体的当前状态描述】。
    - 状态描述应当简洁有力，每项不超过20字。
    - 状态应当反映【当前回复结束时】的最新情况，体现角色在本轮互动中的变化。
    - 使用第三人称描述角色状态。
    - 【不要】在正文中提及状态栏的存在，它是一个隐形的UI元素。
    </FinalNotes>
</StatusUpdateProtocol>

<StatusUpdateProtocol name="DynamicUserStatusEngine">
    <Purpose>
    在回复的【末尾】生成HTML格式的可折叠状态栏，用于追踪和展示【用户扮演角色】的实时状态。
    </Purpose>
    <SettingsIntegration>
    【状态栏标题模板】（放在 <summary> 标签内）：
    ${u.titleTemplate}
    【状态项模板】（每行一项，将 [占位符] 替换为实际状态值）：
    ${userTpl}
    【各项书写规则】：
    ${userRules}
    </SettingsIntegration>
    <Rules>
    1. 仅使用用户最新消息中明确写出的行为、语言和状态。
    2. 不得推测用户未明确表达的心理、情绪、感受、身体反应或动作；缺少依据的项目填写「未明确」。
    3. 状态栏只能整理用户已经提供的信息，不能替用户补充或推进任何状态。
    </Rules>
    <HTMLFormat>
    <details class="st-sb-card">
    <summary>${u.titleTemplate}</summary>
    <div class="details-content">
    ${userTpl}
    </div>
    </details>
    </HTMLFormat>
    <FinalNotes>
    - 将模板中的 [占位符] 替换为真实的、具体的当前状态描述。
    - 状态描述应当简洁有力，每项不超过20字。
    - 状态应当反映当前回复结束时的最新情况。
    - 使用第三人称或客观描述（例如"兴奋"，而不是"你感到兴奋"）。
    - 【不要】在正文中提及状态栏的存在，它是一个隐形的UI元素。
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
        // 注入到最新一条消息之前（对话最深层），模型生成回复时在末尾输出状态栏
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
    // 总开关
    $('#sb_enabled').prop('checked', !!s.enabled);
    // 主题控件
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
    // 标题模板
    $('#sb_char_title').val(s.character.titleTemplate);
    $('#sb_user_title').val(s.user.titleTemplate);
    // 条目列表
    renderItemList('character', s.character.items);
    renderItemList('user', s.user.items);
    // 灰化：未启用时参数区变灰
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
    // 空态
    if (!items.length) {
        box.append('<div class="sb-empty">（无条目，点下方"添加条目"）</div>');
    }
}

function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- 事件绑定（同命名空间先 off 一次再链式 on，防互清） ----------
function bindEvents() {
    const NS = '.stsb';
    $(document).off(`click${NS} change${NS} input${NS}`);

    // 总开关
    $(document).on(`change${NS}`, '#sb_enabled', function () {
        const s = getSettings();
        s.enabled = this.checked;
        saveSettings();
        refreshAllUI();
    });

    // 预设色板
    $(document).on(`click${NS}`, '.sb-swatch', function () {
        const s = getSettings();
        s.theme.primary = this.dataset.hex;
        saveSettings();
        applyTheme();
        refreshAllUI();
    });

    // 自定义取色
    $(document).on(`input${NS}`, '#sb_color_custom', function () {
        const s = getSettings();
        s.theme.primary = this.value;
        $('#sb_hex_label').text(this.value);
        saveSettings();
        applyTheme();
        document.querySelectorAll('.sb-swatch').forEach(sw => sw.classList.toggle('active', sw.dataset.hex.toLowerCase() === this.value.toLowerCase()));
    });

    // 边框样式
    $(document).on(`click${NS}`, '.sb-style-btn', function () {
        const s = getSettings();
        s.theme.borderStyle = this.dataset.style;
        saveSettings();
        applyTheme();
        document.querySelectorAll('.sb-style-btn').forEach(b => b.classList.toggle('active', b === this));
    });

    // 粗细 / 圆角
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

    // 恢复默认主题
    $(document).on(`click${NS}`, '#sb_theme_reset', function () {
        const s = getSettings();
        s.theme = structuredClone(DEFAULTS.theme);
        saveSettings();
        applyTheme();
        refreshAllUI();
    });

    // 标题模板输入
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

    // 条目：label / rule 输入
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

    // 条目：上移 / 下移 / 删除（事件委托在文档层，捕获由 jQuery 委托处理）
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

    // 添加条目
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

    // 卡片折叠（点标题栏切换 sb-collapsed）
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
(async () => {
    getSettings(); // 初始化默认设置
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.APP_READY, () => {
        applyTheme();
        renderSettingsPanel();
    });
    // 切聊天/重载时保证主题还在
    eventSource.on(event_types.CHAT_CHANGED, () => {
        applyTheme();
    });
})();
