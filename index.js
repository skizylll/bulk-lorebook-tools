/**
 * Bulk Lorebook Tools — SillyTavern UI extension.
 *
 * Adds a panel to the World Info (lorebook) editor that allows:
 *   - selecting many entries at once (checkbox list + All / None / Invert / search),
 *   - copying or moving the selected entries into another lorebook,
 *   - deleting many entries at once,
 *   - creating the target lorebook on the fly.
 *
 * Only the public SillyTavern context API (`SillyTavern.getContext()`) is used,
 * so the extension does not rely on internal module paths.
 */

const LOG_PREFIX = '[BulkLorebookTools]';
const MAX_RENDERED = 1000;
const REFRESH_DEBOUNCE_MS = 250;

/* ------------------------------------------------------------------ utils */

/** Returns the SillyTavern context, or null if the app is not ready yet. */
function getCtx() {
    const ctx = globalThis.SillyTavern?.getContext?.();
    return ctx ?? null;
}

function log(...args) {
    console.debug(LOG_PREFIX, ...args);
}

function warn(...args) {
    console.warn(LOG_PREFIX, ...args);
}

function error(...args) {
    console.error(LOG_PREFIX, ...args);
}

/** Escapes a string for safe insertion into HTML. */
function esc(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/** Waits until the predicate returns a truthy value or the timeout expires. */
async function waitFor(predicate, timeoutMs = 15000, intervalMs = 100) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        let value;
        try {
            value = predicate();
        } catch (e) {
            value = null;
        }
        if (value) {
            return value;
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    return null;
}

/* ------------------------------------------------------------- i18n ----- */

const EN = {
    title: 'Bulk Lorebook Tools',
    working_book: 'Working book',
    target_book: 'Target book',
    search_ph: 'Search entries…',
    all: 'All',
    none: 'None',
    invert: 'Invert',
    reload: 'Reload list',
    close: 'Close',
    open_title: 'Bulk Lorebook Tools',
    selected: n => `${n} selected`,
    skip_dupes: 'Skip duplicates by title',
    copy: 'Copy to target',
    move: 'Move to target',
    del: 'Delete selected',
    new_book: 'New',
    new_book_prompt: 'Name of the new lorebook:',
    no_entries: 'This lorebook has no entries.',
    no_match: 'No entries match the filter.',
    truncated: n => `Showing the first ${n} entries — use the search box to narrow the list.`,
    no_selection: 'Nothing selected.',
    pick_source: 'Pick a working lorebook.',
    pick_target: 'Pick a target lorebook.',
    same_book: 'The working and target lorebooks must be different.',
    err_load: 'Could not load the lorebook data.',
    err_uid: 'Could not find a free UID in the target lorebook.',
    nothing_to_do: 'There is nothing to transfer.',
    bad_name: 'Enter a valid lorebook name (no \\ / : * ? " < > |).',
    exists: name => `A lorebook named "${name}" already exists.`,
    create_failed: 'Could not create the lorebook.',
    created: name => `Lorebook "${name}" was created.`,
    ask_move: (n, s, t) => `Move ${n} entries from "${s}" to "${t}"?\nThey will be removed from "${s}".`,
    ask_delete: (n, s) => `Permanently delete ${n} entries from "${s}"?\nThis cannot be undone.`,
    confirm: 'Confirm',
    cancel: 'Cancel',
    done_copy: (n, t) => `Copied ${n} entr${n === 1 ? 'y' : 'ies'} to "${t}".`,
    done_move: (n, t) => `Moved ${n} entr${n === 1 ? 'y' : 'ies'} to "${t}".`,
    done_delete: (n, s) => `Deleted ${n} entr${n === 1 ? 'y' : 'ies'} from "${s}".`,
    skipped: n => ` ${n} skipped as duplicates.`,
    no_title: '(no title)',
};

const RU = {
    title: 'Массовые операции с лорбуками',
    working_book: 'Рабочий лорбук',
    target_book: 'Целевой лорбук',
    search_ph: 'Поиск записей…',
    all: 'Все',
    none: 'Ничего',
    invert: 'Инверсия',
    reload: 'Обновить список',
    close: 'Закрыть',
    open_title: 'Массовые операции с лорбуками',
    selected: n => `Выбрано: ${n}`,
    skip_dupes: 'Пропускать дубликаты по названию',
    copy: 'Скопировать в целевой',
    move: 'Перенести в целевой',
    del: 'Удалить выбранные',
    new_book: 'Новый',
    new_book_prompt: 'Название нового лорбука:',
    no_entries: 'В этом лорбуке нет записей.',
    no_match: 'По фильтру ничего не найдено.',
    truncated: n => `Показаны первые ${n} записей — уточните поиск.`,
    no_selection: 'Ничего не выбрано.',
    pick_source: 'Выберите рабочий лорбук.',
    pick_target: 'Выберите целевой лорбук.',
    same_book: 'Рабочий и целевой лорбуки должны различаться.',
    err_load: 'Не удалось загрузить данные лорбука.',
    err_uid: 'Не удалось найти свободный UID в целевом лорбуке.',
    nothing_to_do: 'Переносить нечего.',
    bad_name: 'Введите корректное название (без \\ / : * ? " < > |).',
    exists: name => `Лорбук с названием "${name}" уже существует.`,
    create_failed: 'Не удалось создать лорбук.',
    created: name => `Лорбук "${name}" создан.`,
    ask_move: (n, s, t) => `Перенести записей (${n}) из "${s}" в "${t}"?\nОни будут удалены из "${s}".`,
    ask_delete: (n, s) => `Удалить ${n} записей из "${s}" навсегда?\nОтменить это будет нельзя.`,
    confirm: 'Подтвердить',
    cancel: 'Отмена',
    done_copy: (n, t) => `Скопировано записей: ${n} → "${t}".`,
    done_move: (n, t) => `Перенесено записей: ${n} → "${t}".`,
    done_delete: (n, s) => `Удалено записей: ${n} ← "${s}".`,
    skipped: n => ` Пропущено дубликатов: ${n}.`,
    no_title: '(без названия)',
};

const TRANSLATIONS = { en: EN, 'ru-ru': RU, ru: RU };

/** Returns a localized UI string. */
function tr(key, ...args) {
    let locale = 'en';
    try {
        locale = String(getCtx()?.getCurrentLocale?.() || 'en').toLowerCase();
    } catch (e) {
        /* SillyTavern is not ready yet, fall back to English */
    }
    const dict = TRANSLATIONS[locale] ?? TRANSLATIONS[locale.split('-')[0]] ?? EN;
    const value = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : EN[key];
    return typeof value === 'function' ? value(...args) : value;
}

/* ------------------------------------------------------------ state ----- */

const state = {
    /** Name of the lorebook shown in the entry list. */
    sourceName: null,
    /** Selected entry UIDs (stored as strings). */
    selected: new Set(),
    /** Current search filter. */
    search: '',
    /** Entries of the working book currently rendered (uid strings). */
    entries: [],
    /** Title of the book that was open in the editor last time we looked. */
    lastEditorBook: null,
    /** Timer id for the debounced refresh. */
    refreshTimer: null,
};

/* -------------------------------------------------- core data access ---- */

/** All lorebook names known to the client. */
function worldNames() {
    const ctx = getCtx();
    try {
        if (typeof ctx?.getWorldInfoNames === 'function') {
            return ctx.getWorldInfoNames() ?? [];
        }
    } catch (e) {
        warn('getWorldInfoNames() failed', e);
    }
    // Fallback: read the list straight from the editor dropdown.
    return $('#world_editor_select option')
        .map((_, option) => String($(option).text()))
        .get()
        .filter(name => name && !name.startsWith('---'));
}

/** Name of the lorebook currently opened in the World Info editor. */
function currentEditorBook() {
    const index = Number($('#world_editor_select').val());
    const names = worldNames();
    if (Number.isInteger(index) && names[index] !== undefined) {
        return names[index];
    }
    return null;
}

/** Loads lorebook data (the core cache always hands out a fresh clone). */
async function loadBook(name) {
    if (!name) {
        return null;
    }
    const ctx = getCtx();
    const data = await ctx.loadWorldInfo(name);
    return data && typeof data === 'object' ? data : null;
}

/** Human readable title of an entry. */
function entryTitle(entry) {
    const comment = String(entry?.comment ?? '').trim();
    if (comment) {
        return comment;
    }
    const keys = Array.isArray(entry?.key) ? entry.key : [entry?.key];
    const firstKey = keys.map(k => String(k ?? '').trim()).find(k => k);
    return firstKey || tr('no_title');
}

/** Sort key matching the order used by the editor (displayIndex, then uid). */
function orderKey(entry) {
    const displayIndex = Number(entry?.displayIndex);
    if (Number.isFinite(displayIndex)) {
        return displayIndex;
    }
    const uid = Number(entry?.uid);
    return Number.isFinite(uid) ? uid : 0;
}

/** First unused integer UID in the given lorebook data. */
function freeUid(data) {
    const used = data?.entries ?? {};
    for (let uid = 0; uid < 1_000_000; uid++) {
        if (!(uid in used)) {
            return uid;
        }
    }
    return null;
}

/** Highest displayIndex in the given lorebook data (-1 when empty). */
function maxDisplayIndex(data) {
    return Object.values(data?.entries ?? {}).reduce((max, entry) => Math.max(max, orderKey(entry)), -1);
}

/**
 * Removes an entry from `originalData` (the untouched copy of an imported
 * book), mirroring what the core does when an entry is moved.
 */
function removeOriginalData(data, uid) {
    if (data && data.originalData && Array.isArray(data.originalData.entries)) {
        const index = data.originalData.entries.findIndex(entry => String(entry?.uid) === String(uid));
        if (index >= 0) {
            data.originalData.entries.splice(index, 1);
        }
    }
}

/** Reloads the World Info editor when one of the changed books is open. */
function refreshEditorIfOpen(names) {
    const open = currentEditorBook();
    if (open && names.includes(open)) {
        getCtx().reloadWorldInfoEditor(open);
    }
}

/* ------------------------------------------------------------ dialogs --- */

/** Shows a toastr notification (falls back to the console). */
function toast(type, message) {
    const toastr = globalThis.toastr;
    if (toastr && typeof toastr[type] === 'function') {
        toastr[type](message);
        return;
    }
    log(type, message);
}

/** Native SillyTavern confirmation popup. */
async function confirmDialog(message) {
    const ctx = getCtx();
    const options = { okButton: tr('confirm'), cancelButton: tr('cancel') };
    try {
        if (typeof ctx?.callGenericPopup === 'function' && ctx.POPUP_TYPE) {
            const result = await ctx.callGenericPopup(message, ctx.POPUP_TYPE.CONFIRM, '', options);
            return result === ctx.POPUP_RESULT?.AFFIRMATIVE;
        }
        if (ctx?.Popup?.show?.confirm) {
            return Boolean(await ctx.Popup.show.confirm(tr('title'), message));
        }
    } catch (e) {
        error('Confirmation popup failed', e);
    }
    return true;
}

/** Native SillyTavern input popup. Returns the trimmed string or null. */
async function inputDialog(message, initialValue = '') {
    const ctx = getCtx();
    try {
        if (typeof ctx?.callGenericPopup === 'function' && ctx.POPUP_TYPE) {
            const result = await ctx.callGenericPopup(message, ctx.POPUP_TYPE.INPUT, initialValue, {
                okButton: tr('confirm'),
                cancelButton: tr('cancel'),
            });
            return typeof result === 'string' ? result.trim() : null;
        }
        return globalThis.prompt(message, initialValue);
    } catch (e) {
        error('Input popup failed', e);
        return null;
    }
}

/* -------------------------------------------------------------- panel --- */

const PANEL_ID = 'blt-panel';
const OPEN_BUTTON_ID = 'blt-open';

function panelHtml() {
    return `
<div id="${PANEL_ID}" style="display:none">
    <div class="blt-header">
        <i class="fa-solid fa-layer-group"></i>
        <span>${esc(tr('title'))}</span>
        <i id="blt-close" class="blt-close fa-solid fa-circle-xmark" title="${esc(tr('close'))}"></i>
    </div>
    <div class="blt-row">
        <label>${esc(tr('working_book'))}</label>
        <select id="blt-source" class="text_pole textarea_compact blt-select"></select>
        <div id="blt-reload" class="menu_button menu_button_icon" title="${esc(tr('reload'))}">
            <i class="fa-solid fa-arrows-rotate"></i>
        </div>
    </div>
    <div class="blt-row">
        <input id="blt-search" type="search" class="text_pole textarea_compact" placeholder="${esc(tr('search_ph'))}">
        <div id="blt-all" class="menu_button menu_button_icon"><i class="fa-solid fa-check-double"></i><span>${esc(tr('all'))}</span></div>
        <div id="blt-none" class="menu_button menu_button_icon"><i class="fa-regular fa-square"></i><span>${esc(tr('none'))}</span></div>
        <div id="blt-invert" class="menu_button menu_button_icon"><i class="fa-solid fa-shuffle"></i><span>${esc(tr('invert'))}</span></div>
        <span id="blt-count" class="blt-count"></span>
    </div>
    <div id="blt-list" class="blt-list"></div>
    <div class="blt-row">
        <label>${esc(tr('target_book'))}</label>
        <select id="blt-target" class="text_pole textarea_compact blt-select"></select>
        <div id="blt-new" class="menu_button menu_button_icon" title="${esc(tr('new_book_prompt'))}">
            <i class="fa-solid fa-plus"></i><span>${esc(tr('new_book'))}</span>
        </div>
        <label class="checkbox_label blt-checkbox">
            <input id="blt-skip-dupes" type="checkbox" checked>
            <span>${esc(tr('skip_dupes'))}</span>
        </label>
    </div>
    <div class="blt-row blt-actions">
        <div id="blt-copy" class="menu_button menu_button_icon"><i class="fa-solid fa-paste"></i><span>${esc(tr('copy'))}</span></div>
        <div id="blt-move" class="menu_button menu_button_icon"><i class="fa-solid fa-right-left"></i><span>${esc(tr('move'))}</span></div>
        <div id="blt-delete" class="menu_button menu_button_icon blt-danger"><i class="fa-solid fa-trash-can"></i><span>${esc(tr('del'))}</span></div>
    </div>
</div>`;
}

function isPanelOpen() {
    const panel = document.getElementById(PANEL_ID);
    return !!panel && panel.style.display !== 'none';
}

/** Fills the working/target dropdowns with every known lorebook. */
function populateBookSelects() {
    const names = worldNames();
    const $source = $('#blt-source');
    const $target = $('#blt-target');
    const previousTarget = String($target.val() ?? '') || null;

    if (state.sourceName && !names.includes(state.sourceName)) {
        state.sourceName = null;
        state.selected.clear();
    }
    if (!state.sourceName) {
        state.sourceName = currentEditorBook() ?? names[0] ?? null;
    }

    $source.empty();
    $target.empty();

    for (const name of names) {
        $source.append(new Option(name, name));
        $target.append(new Option(name, name));
    }

    if (state.sourceName) {
        $source.val(state.sourceName);
    }

    let target = previousTarget;
    if (!target || !names.includes(target) || target === state.sourceName) {
        target = names.find(name => name !== state.sourceName) ?? state.sourceName ?? null;
    }
    if (target) {
        $target.val(target);
    }
}

function openPanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) {
        return;
    }

    const names = worldNames();
    if (!state.sourceName || !names.includes(state.sourceName)) {
        state.sourceName = currentEditorBook() ?? names[0] ?? null;
        state.selected.clear();
    }

    panel.style.display = 'flex';
    populateBookSelects();
    $('#blt-search').val(state.search);
    refreshList();
}

function closePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
        panel.style.display = 'none';
    }
}

function togglePanel() {
    if (isPanelOpen()) {
        closePanel();
    } else {
        openPanel();
    }
    $(`#${OPEN_BUTTON_ID}`).toggleClass('blt-open-active', isPanelOpen());
}

/* --------------------------------------------------------- entry list --- */

function updateCount() {
    $('#blt-count').text(tr('selected', state.selected.size));
}

/** Records currently passing the search filter. */
function visibleEntries() {
    const search = state.search.trim().toLowerCase();
    if (!search) {
        return state.entries;
    }
    return state.entries.filter(record => record.title.toLowerCase().includes(search));
}

/** Reloads the working book and rebuilds the entry list. */
async function refreshList() {
    if (!isPanelOpen()) {
        return;
    }

    const listEl = document.getElementById('blt-list');
    if (!listEl) {
        return;
    }

    if (!state.sourceName) {
        state.entries = [];
        listEl.innerHTML = `<div class="blt-empty">${esc(tr('pick_source'))}</div>`;
        updateCount();
        return;
    }

    const data = await loadBook(state.sourceName);
    if (!data || !data.entries) {
        state.entries = [];
        listEl.innerHTML = `<div class="blt-empty">${esc(tr('err_load'))}</div>`;
        updateCount();
        return;
    }

    state.entries = Object.values(data.entries)
        .map(entry => ({
            uid: String(entry?.uid ?? ''),
            title: entryTitle(entry),
            disabled: Boolean(entry?.disable),
            order: orderKey(entry),
        }))
        .filter(record => record.uid !== '')
        .sort((a, b) => a.order - b.order);

    renderList();
}

/** Renders the (filtered) entry list from `state.entries`. */
function renderList() {
    const listEl = document.getElementById('blt-list');
    if (!listEl) {
        return;
    }

    if (!state.entries.length) {
        listEl.innerHTML = `<div class="blt-empty">${esc(tr('no_entries'))}</div>`;
        updateCount();
        return;
    }

    const records = visibleEntries();
    if (!records.length) {
        listEl.innerHTML = `<div class="blt-empty">${esc(tr('no_match'))}</div>`;
        updateCount();
        return;
    }

    const shown = records.slice(0, MAX_RENDERED);
    const rows = shown.map(record => {
        const checked = state.selected.has(record.uid) ? ' checked' : '';
        const disabledClass = record.disabled ? ' blt-disabled' : '';
        return `<label class="blt-entry${disabledClass}" data-uid="${esc(record.uid)}">`
            + `<input type="checkbox" class="blt-entry-check"${checked}>`
            + `<span class="blt-entry-title">${esc(record.title)}</span>`
            + `<span class="blt-entry-uid">#${esc(record.uid)}</span>`
            + '</label>';
    }).join('');

    const note = records.length > shown.length
        ? `<div class="blt-note">${esc(tr('truncated', shown.length))}</div>`
        : '';

    listEl.innerHTML = note + rows;
    updateCount();
}

/** UIDs of the selected entries, in the order shown in the list. */
function selectedUids() {
    return state.entries
        .filter(record => state.selected.has(record.uid))
        .map(record => record.uid);
}

/* ------------------------------------------------------------ actions --- */

/** Creates an empty lorebook after asking the user for a name. */
async function createBook() {
    const name = await inputDialog(tr('new_book_prompt'), '');
    if (name === null) {
        return;
    }

    const trimmed = name.trim();
    if (!trimmed || /[\\/:*?"<>|]/.test(trimmed)) {
        toast('error', tr('bad_name'));
        return;
    }

    const names = worldNames();
    if (names.includes(trimmed)) {
        toast('warning', tr('exists', trimmed));
        return;
    }

    const ctx = getCtx();
    try {
        await ctx.saveWorldInfo(trimmed, { entries: {} }, true);
        await ctx.updateWorldInfoList();
    } catch (e) {
        error('Could not create the lorebook', e);
        toast('error', tr('create_failed'));
        return;
    }

    toast('success', tr('created', trimmed));
    populateBookSelects();
    $('#blt-target').val(trimmed);
    log(`Created lorebook "${trimmed}"`);
}

/** Copies or moves the selected entries into the target lorebook. */
async function transferSelected(mode) {
    const ctx = getCtx();
    const source = state.sourceName;
    const target = String($('#blt-target').val() ?? '');

    if (!source) {
        toast('warning', tr('pick_source'));
        return;
    }
    if (!target) {
        toast('warning', tr('pick_target'));
        return;
    }
    if (source === target) {
        toast('warning', tr('same_book'));
        return;
    }

    const uids = selectedUids();
    if (!uids.length) {
        toast('warning', tr('no_selection'));
        return;
    }

    if (mode === 'move' && !(await confirmDialog(tr('ask_move', uids.length, source, target)))) {
        return;
    }

    const sourceData = await loadBook(source);
    const targetData = await loadBook(target);
    if (!sourceData?.entries || !targetData?.entries) {
        toast('error', tr('err_load'));
        return;
    }

    const skipDuplicates = $('#blt-skip-dupes').prop('checked');
    const knownTitles = new Set(
        Object.values(targetData.entries)
            .map(entry => String(entry?.comment ?? '').trim().toLowerCase())
            .filter(title => title),
    );

    let nextIndex = maxDisplayIndex(targetData) + 1;
    let copied = 0;
    let skipped = 0;
    const transferred = [];

    for (const uid of uids) {
        const entry = sourceData.entries[uid];
        if (!entry) {
            continue;
        }

        const title = String(entry.comment ?? '').trim().toLowerCase();
        if (skipDuplicates && title && knownTitles.has(title)) {
            skipped++;
            continue;
        }

        const newUid = freeUid(targetData);
        if (newUid === null) {
            toast('error', tr('err_uid'));
            break;
        }

        const clone = structuredClone(entry);
        clone.uid = newUid;
        clone.displayIndex = nextIndex++;
        targetData.entries[newUid] = clone;

        if (title) {
            knownTitles.add(title);
        }

        copied++;
        transferred.push(uid);
    }

    if (!copied) {
        toast('warning', tr('nothing_to_do'));
        return;
    }

    try {
        await ctx.saveWorldInfo(target, targetData, true);

        if (mode === 'move') {
            for (const uid of transferred) {
                delete sourceData.entries[uid];
                removeOriginalData(sourceData, uid);
            }
            await ctx.saveWorldInfo(source, sourceData, true);
        }
    } catch (e) {
        error('Transfer failed', e);
        toast('error', tr('err_load'));
        return;
    }

    state.selected.clear();
    refreshEditorIfOpen([source, target]);
    populateBookSelects();
    await refreshList();

    const message = mode === 'move' ? tr('done_move', copied, target) : tr('done_copy', copied, target);
    toast('success', message + (skipped ? tr('skipped', skipped) : ''));
    log(`${mode === 'move' ? 'Moved' : 'Copied'} ${copied} entries from "${source}" to "${target}"`);
}

/** Deletes the selected entries from the working lorebook. */
async function deleteSelected() {
    const ctx = getCtx();
    const source = state.sourceName;

    if (!source) {
        toast('warning', tr('pick_source'));
        return;
    }

    const uids = selectedUids();
    if (!uids.length) {
        toast('warning', tr('no_selection'));
        return;
    }

    if (!(await confirmDialog(tr('ask_delete', uids.length, source)))) {
        return;
    }

    const data = await loadBook(source);
    if (!data?.entries) {
        toast('error', tr('err_load'));
        return;
    }

    let deleted = 0;
    for (const uid of uids) {
        if (data.entries[uid]) {
            delete data.entries[uid];
            removeOriginalData(data, uid);
            deleted++;
        }
    }

    if (!deleted) {
        toast('warning', tr('nothing_to_do'));
        return;
    }

    try {
        await ctx.saveWorldInfo(source, data, true);
    } catch (e) {
        error('Delete failed', e);
        toast('error', tr('err_load'));
        return;
    }

    state.selected.clear();
    refreshEditorIfOpen([source]);
    await refreshList();
    toast('success', tr('done_delete', deleted, source));
    log(`Deleted ${deleted} entries from "${source}"`);
}

/* ------------------------------------------------------------- wiring --- */

function bindEvents() {
    const $open = $(`#${OPEN_BUTTON_ID}`);
    $open.off('click.blt').on('click.blt', () => togglePanel());

    $('#blt-close').off('click.blt').on('click.blt', () => {
        closePanel();
        $open.removeClass('blt-open-active');
    });

    $('#blt-source').off('change.blt').on('change.blt', () => {
        state.sourceName = String($('#blt-source').val() ?? '') || null;
        state.selected.clear();
        refreshList();
    });

    $('#blt-reload').off('click.blt').on('click.blt', () => {
        const editorBook = currentEditorBook();
        if (editorBook) {
            state.sourceName = editorBook;
        }
        populateBookSelects();
        state.selected.clear();
        refreshList();
    });

    $('#blt-search').off('input.blt').on('input.blt', () => {
        state.search = String($('#blt-search').val() ?? '');
        renderList();
    });

    $('#blt-all').off('click.blt').on('click.blt', () => {
        for (const record of visibleEntries()) {
            state.selected.add(record.uid);
        }
        renderList();
    });

    $('#blt-none').off('click.blt').on('click.blt', () => {
        for (const record of visibleEntries()) {
            state.selected.delete(record.uid);
        }
        renderList();
    });

    $('#blt-invert').off('click.blt').on('click.blt', () => {
        for (const record of visibleEntries()) {
            if (state.selected.has(record.uid)) {
                state.selected.delete(record.uid);
            } else {
                state.selected.add(record.uid);
            }
        }
        renderList();
    });

    $('#blt-list').off('change.blt', '.blt-entry-check').on('change.blt', '.blt-entry-check', function () {
        const uid = String($(this).closest('.blt-entry').attr('data-uid'));
        if (this.checked) {
            state.selected.add(uid);
        } else {
            state.selected.delete(uid);
        }
        updateCount();
    });

    $('#blt-new').off('click.blt').on('click.blt', () => createBook());
    $('#blt-copy').off('click.blt').on('click.blt', () => transferSelected('copy'));
    $('#blt-move').off('click.blt').on('click.blt', () => transferSelected('move'));
    $('#blt-delete').off('click.blt').on('click.blt', () => deleteSelected());

    // Follow the editor when another lorebook is picked for editing.
    $(document).off('change.blt', '#world_editor_select').on('change.blt', '#world_editor_select', () => {
        const book = currentEditorBook();

        if (book && book !== state.lastEditorBook && state.sourceName === state.lastEditorBook) {
            state.sourceName = book;
            state.selected.clear();
            if (isPanelOpen()) {
                populateBookSelects();
                refreshList();
            }
        }

        state.lastEditorBook = book;
    });
}

function registerEventHandlers() {
    const ctx = getCtx();
    if (!ctx?.eventSource || !ctx?.eventTypes?.WORLDINFO_UPDATED) {
        warn('World Info events are not available; the list will not auto-refresh.');
        return;
    }

    ctx.eventSource.on(ctx.eventTypes.WORLDINFO_UPDATED, () => {
        if (!isPanelOpen()) {
            return;
        }
        clearTimeout(state.refreshTimer);
        state.refreshTimer = setTimeout(() => refreshList(), REFRESH_DEBOUNCE_MS);
    });
}

/** Inserts the toolbar button and the panel into the World Info popup. */
function injectUi() {
    if (document.getElementById(OPEN_BUTTON_ID)) {
        return true;
    }

    const popup = document.getElementById('world_popup');
    if (!popup) {
        return false;
    }

    const button = $(`<div id="${OPEN_BUTTON_ID}" class="menu_button fa-solid fa-layer-group"`
        + ` title="${esc(tr('open_title'))}"></div>`);
    const anchor = $('#world_popup_new');

    if (anchor.length) {
        anchor.after(button);
    } else {
        $(popup).find('.flex-container').first().append(button);
    }

    const list = document.getElementById('world_popup_entries_list');
    if (list) {
        $(list).before(panelHtml());
    } else {
        $(popup).append(panelHtml());
    }

    bindEvents();
    log('UI injected into the World Info popup');
    return true;
}

/* --------------------------------------------------------------- init --- */

async function init() {
    const ready = await waitFor(() => document.getElementById('world_popup') && getCtx());
    if (!ready) {
        warn('The World Info popup was not found; the extension is idle.');
        return;
    }

    injectUi();
    registerEventHandlers();
    state.lastEditorBook = currentEditorBook();
}

jQuery(() => {
    init().catch(e => error('Initialization failed', e));
});







