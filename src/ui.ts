import { store, ToolId } from './store';
import { Editor } from './editor';
import { h, iconBtn, toast, modal } from './dom';
import { UI_ICONS, MARKER_ICONS, markerSvg, svgIcon } from './icons';
import {
  DOOR_TYPES, ROOM_COLORS, createArea, createProject, newId, shiftArea, Area, canMoveRoom, moveRoom, parseCell,
} from './model';
import { exportPng, pickProjectFile, readProjectFile, renderPng, saveProjectFile } from './io';
import { roomBoundary } from './render';

const TOOLS: { id: ToolId; name: string; key: string; icon: string; hint: string }[] = [
  { id: 'select', name: 'Select', key: 'V', icon: UI_ICONS.select, hint: 'Click to select · drag rooms, markers and labels to move them · drag empty space to pan' },
  { id: 'room', name: 'Draw rooms', key: 'R', icon: UI_ICONS.room, hint: 'Shift-drag fills a rectangle · right-drag erases · start on a room to extend it' },
  { id: 'erase', name: 'Erase', key: 'E', icon: UI_ICONS.erase, hint: 'Drag to erase cells and markers · shift-drag erases a rectangle · split rooms become separate rooms' },
  { id: 'door', name: 'Doors', key: 'D', icon: UI_ICONS.door, hint: 'Click any wall to place the door type · click again to remove · right-click removes' },
  { id: 'marker', name: 'Markers', key: 'M', icon: UI_ICONS.marker, hint: 'Click a cell to place · click the same icon again to remove · right-click removes' },
  { id: 'label', name: 'Text labels', key: 'T', icon: UI_ICONS.label, hint: 'Click to add a label · drag labels to move (shift snaps) · double-click to edit' },
];

const MARKER_COLORS = ['#ffffff', '#ffd34d', '#3ee0ff', '#ff5a5f', '#5ee07a', '#c58bff'];
const LABEL_COLORS = ['#ffffff', '#ffd34d', '#3ee0ff', '#ff9f6b', '#9fb4d8', '#c58bff'];

export function buildUI(root: HTMLElement) {
  const canvasHost = h('div', { class: 'canvas-host' });
  const toolbar = h('nav', { class: 'toolbar', 'aria-label': 'Tools' });
  const options = h('div', { class: 'options' });
  const inspector = h('aside', { class: 'inspector' });
  const tabs = h('div', { class: 'tabs' });
  const status = h('div', { class: 'status-pos' });
  const zoomEl = h('button', { class: 'zoom-readout', title: 'Fit map to view (F)', onclick: () => editor.fit() });
  const undoBtn = iconBtn(UI_ICONS.undo, 'Undo (Ctrl+Z)', () => store.undo());
  const redoBtn = iconBtn(UI_ICONS.redo, 'Redo (Ctrl+Shift+Z)', () => store.redo());
  const nameInput = h('input', { class: 'project-name', 'aria-label': 'Project name', spellcheck: false });
  bindText(nameInput, () => store.project.name, (v) => { store.project.name = v; });

  root.append(
    h('header', { class: 'topbar' },
      h('div', { class: 'logo' }, logoMark(), h('span', {}, 'MAPROID')),
      nameInput,
      h('div', { class: 'spacer' }),
      h('div', { class: 'group' },
        iconBtn(UI_ICONS.newdoc, 'New project', newProject, {}, 'New'),
        iconBtn(UI_ICONS.open, 'Open project (Ctrl+O)', openProject, {}, 'Open'),
        iconBtn(UI_ICONS.save, 'Save project file (Ctrl+S)', saveProjectFile, {}, 'Save'),
        iconBtn(UI_ICONS.image, 'Export PNG (Ctrl+E)', showExport, {}, 'PNG'),
      ),
      h('div', { class: 'group' }, undoBtn, redoBtn),
      h('div', { class: 'group' }, iconBtn(UI_ICONS.help, 'Keyboard shortcuts (?)', showHelp)),
    ),
    h('div', { class: 'main' },
      toolbar,
      h('div', { class: 'stage' }, options, canvasHost),
      inspector,
    ),
    h('footer', { class: 'bottombar' }, tabs, h('div', { class: 'spacer' }), status, zoomEl),
  );

  const editor = new Editor(canvasHost);
  editor.onStatus = (s) => { status.textContent = s; };
  editor.onRequestLabelFocus = () => {
    // The inspector has already re-rendered synchronously, so the text box exists now.
    const t = document.querySelector<HTMLTextAreaElement>('#label-text');
    if (t) { t.focus(); t.select(); }
  };

  // ---------- toolbar ----------
  function renderToolbar() {
    toolbar.replaceChildren(...TOOLS.map((t) =>
      h('button', {
        class: 'tool' + (store.tool === t.id ? ' active' : ''), title: `${t.name} (${t.key})`, 'aria-label': t.name,
        'aria-pressed': String(store.tool === t.id), onclick: () => store.setTool(t.id),
      }, svgIcon(t.icon, 20), h('kbd', {}, t.key)),
    ));
  }

  // ---------- options bar ----------
  function renderOptions() {
    const t = TOOLS.find((x) => x.id === store.tool)!;
    const parts: Node[] = [h('span', { class: 'opt-title' }, t.name)];
    if (store.tool === 'room') {
      parts.push(
        h('button', {
          class: 'btn small' + (store.pendingNewRoom ? ' armed' : ''), title: 'Next stroke starts a new room (N)',
          onclick: () => { store.pendingNewRoom = !store.pendingNewRoom; store.emit('ui'); },
        }, svgIcon(UI_ICONS.newroom, 16), store.pendingNewRoom ? 'New room armed' : 'New room', h('kbd', {}, 'N')),
        h('span', { class: 'opt-label' }, 'Next color'),
        swatches(ROOM_COLORS, store.roomColor, (c) => { store.roomColor = c; store.savePrefs(); store.emit('ui'); }, true),
        h('label', { class: 'check', title: 'Give each new room the next palette color' },
          h('input', { type: 'checkbox', checked: store.cycleColors, onchange: (e: Event) => { store.cycleColors = (e.target as HTMLInputElement).checked; store.savePrefs(); } }),
          'Cycle'),
      );
    } else if (store.tool === 'door') {
      parts.push(h('div', { class: 'seg' }, ...DOOR_TYPES.map((d) =>
        h('button', {
          class: 'seg-btn' + (store.doorType === d.id ? ' active' : ''), title: d.name,
          onclick: () => { store.doorType = d.id; store.savePrefs(); store.emit('ui'); },
        }, doorChip(d.id, d.color), d.name),
      )));
    } else if (store.tool === 'marker') {
      parts.push(
        h('div', { class: 'seg icons' }, ...MARKER_ICONS.map((m) =>
          h('button', {
            class: 'seg-btn' + (store.markerIcon === m.id ? ' active' : ''), title: m.name, 'aria-label': m.name,
            onclick: () => { store.markerIcon = m.id; store.savePrefs(); store.emit('ui'); },
          }, markerSvg(m.id, 17)),
        )),
        swatches(MARKER_COLORS, store.markerColor, (c) => { store.markerColor = c; store.emit('ui'); }),
      );
    } else if (store.tool === 'label') {
      parts.push(
        h('span', { class: 'opt-label' }, 'Size'),
        sizeSelect(store.labelSize, (v) => { store.labelSize = v; store.emit('ui'); }),
        swatches(LABEL_COLORS, store.labelColor, (c) => { store.labelColor = c; store.emit('ui'); }),
      );
    }
    parts.push(h('span', { class: 'hint' }, t.hint));
    options.replaceChildren(...parts);
  }

  // ---------- inspector ----------
  function renderInspector() {
    const a = store.area;
    const sel = store.selection;
    const sections: Node[] = [];
    if (sel?.kind === 'room') {
      const r = a.rooms.find((x) => x.id === sel.id);
      if (r) sections.push(roomPanel(a, r));
    } else if (sel?.kind === 'label') {
      const l = a.labels.find((x) => x.id === sel.id);
      if (l) {
        const text = h('textarea', { id: 'label-text', rows: 3, spellcheck: false });
        bindText(text, () => l.text, (v) => { l.text = v; });
        sections.push(panel('Label', [
          field('Text', text),
          field('Size', sizeSelect(l.size, (v) => store.edit(() => { l.size = v; store.labelSize = v; }))),
          field('Color', swatches(LABEL_COLORS, l.color, (c) => store.edit(() => { l.color = c; store.labelColor = c; }), true)),
          h('div', { class: 'actions' }, dangerBtn('Delete label', deleteSelection)),
        ], l.id));
      }
    } else if (sel?.kind === 'marker') {
      const m = a.markers.find((x) => x.id === sel.id);
      if (m) {
        const def = MARKER_ICONS.find((i) => i.id === m.icon);
        sections.push(panel('Marker', [
          h('div', { class: 'kv' }, h('span', {}, 'Cell'), h('span', {}, `${m.x}, ${m.y}`)),
          field('Icon', h('div', { class: 'icon-grid' }, ...MARKER_ICONS.map((i) =>
            h('button', {
              class: 'seg-btn' + (i.id === m.icon ? ' active' : ''), title: i.name, 'aria-label': i.name,
              onclick: () => store.edit(() => { m.icon = i.id; }),
            }, markerSvg(i.id, 18))))),
          h('div', { class: 'muted small' }, def?.name ?? m.icon),
          field('Color', swatches(MARKER_COLORS, m.color, (c) => store.edit(() => { m.color = c; }), true)),
          h('div', { class: 'actions' }, dangerBtn('Delete marker', deleteSelection)),
        ], m.id));
      }
    }
    if (!sections.length) {
      sections.push(areaPanel(a), viewPanel(), roomsPanel(a));
    }
    inspector.replaceChildren(...sections);
  }

  function roomPanel(a: Area, r: (Area['rooms'])[number]) {
    const name = h('input', { id: 'room-name', placeholder: 'Unnamed room', spellcheck: false });
    bindText(name, () => r.name, (v) => { r.name = v; });
    const notes = h('textarea', { rows: 4, placeholder: 'Notes, items, enemies…' });
    bindText(notes, () => r.notes, (v) => { r.notes = v; });
    const boundary = new Set(roomBoundary(r));
    const doorCount = a.doors.filter((d) => boundary.has(d.edge)).length;
    const xs = r.cells.map((k) => parseCell(k));
    const w = Math.max(...xs.map((p) => p[0])) - Math.min(...xs.map((p) => p[0])) + 1;
    const hgt = Math.max(...xs.map((p) => p[1])) - Math.min(...xs.map((p) => p[1])) + 1;
    return panel('Room', [
      field('Name', name),
      field('Color', h('div', {}, swatches(ROOM_COLORS, r.color, (c) => store.edit(() => { r.color = c; }), true))),
      field('Notes', notes),
      h('div', { class: 'stats' },
        stat('Cells', r.cells.length), stat('Size', `${w}×${hgt}`), stat('Doors', doorCount)),
      h('div', { class: 'actions' },
        h('button', {
          class: 'btn', title: 'Make this the active room for drawing',
          onclick: () => { store.activeRoomId = r.id; store.pendingNewRoom = false; store.setTool('room'); },
        }, svgIcon(UI_ICONS.room, 16), 'Draw into room'),
        dangerBtn('Delete', deleteSelection),
      ),
    ], r.id);
  }

  function areaPanel(a: Area) {
    const name = h('input', { spellcheck: false });
    bindText(name, () => a.name, (v) => { a.name = v; });
    const num = (get: () => number, set: (n: number) => void, min: number, max: number, title: string) => {
      const inp = h('input', { type: 'number', min, max, value: String(get()), title });
      inp.addEventListener('change', () => {
        const n = Math.round(Number(inp.value));
        if (!Number.isFinite(n)) { inp.value = String(get()); return; }
        const v = Math.min(max, Math.max(min, n));
        if (v === get()) { inp.value = String(v); return; }
        store.edit(() => set(v));
        editor.request();
      });
      return inp;
    };
    const shift = (dx: number, dy: number) => () => store.edit(() => shiftArea(a, dx, dy));
    return panel('Area', [
      field('Name', name),
      h('div', { class: 'row2' },
        field('Columns', num(() => a.cols, (v) => { a.cols = v; }, 1, 1000, 'Map width in cells')),
        field('Rows', num(() => a.rows, (v) => { a.rows = v; }, 1, 1000, 'Map height in cells')),
      ),
      h('div', { class: 'row2' },
        field('Cell width', num(() => a.cellW, (v) => { a.cellW = v; }, 4, 256, 'Cell width in pixels')),
        field('Cell height', num(() => a.cellH, (v) => { a.cellH = v; }, 4, 256, 'Cell height in pixels')),
      ),
      field('Shift contents', h('div', { class: 'nudge' },
        iconBtn(UI_ICONS.arrowL, 'Shift everything left one cell', shift(-1, 0)),
        iconBtn(UI_ICONS.arrowU, 'Shift everything up one cell', shift(0, -1)),
        iconBtn(UI_ICONS.arrowD, 'Shift everything down one cell', shift(0, 1)),
        iconBtn(UI_ICONS.arrowR, 'Shift everything right one cell', shift(1, 0)),
      )),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: duplicateArea }, svgIcon(UI_ICONS.copy, 16), 'Duplicate'),
        dangerBtn('Delete area', deleteArea, store.project.areas.length < 2),
      ),
    ]);
  }

  function viewPanel() {
    const toggle = (label: string, get: () => boolean, set: (v: boolean) => void, key: string) =>
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: get(), onchange: (e: Event) => { set((e.target as HTMLInputElement).checked); store.savePrefs(); editor.request(); } }),
        label, h('kbd', {}, key));
    return panel('View', [
      toggle('Grid', () => store.showGrid, (v) => { store.showGrid = v; }, 'G'),
      toggle('Room names', () => store.showNames, (v) => { store.showNames = v; }, 'L'),
      toggle('Room IDs', () => store.showIds, (v) => { store.showIds = v; }, 'I'),
    ]);
  }

  function roomsPanel(a: Area) {
    if (!a.rooms.length) {
      return panel('Rooms', [h('p', { class: 'muted empty' }, 'No rooms yet. Pick the room tool (R) and paint cells on the grid.')]);
    }
    const sorted = [...a.rooms].sort((x, y) => parseInt(x.id.slice(1)) - parseInt(y.id.slice(1)));
    return panel(`Rooms · ${a.rooms.length}`, [
      h('ul', { class: 'room-list' }, ...sorted.map((r) =>
        h('li', {},
          h('button', { onclick: () => { store.select({ kind: 'room', id: r.id }); centerOnRoom(r); } },
            h('span', { class: 'sw', style: `background:${r.color}` }),
            h('span', { class: 'rid' }, r.id),
            h('span', { class: 'rname' + (r.name ? '' : ' muted') }, r.name || 'Unnamed'),
            h('span', { class: 'rcount' }, String(r.cells.length)),
          )))),
    ]);
  }

  function centerOnRoom(r: Area['rooms'][number]) {
    const a = store.area;
    const v = editor.view;
    const rect = canvasHost.getBoundingClientRect();
    let sx = 0, sy = 0;
    for (const k of r.cells) { const [x, y] = parseCell(k); sx += x + 0.5; sy += y + 0.5; }
    const cx = (sx / r.cells.length) * a.cellW, cy = (sy / r.cells.length) * a.cellH;
    v.x = rect.width / 2 - cx * v.zoom;
    v.y = rect.height / 2 - cy * v.zoom;
    editor.request();
  }

  // ---------- tabs ----------
  function renderTabs() {
    const items = store.project.areas.map((a) => {
      const tab = h('button', {
        class: 'tab' + (a.id === store.areaId ? ' active' : ''), title: 'Double-click to rename',
        onclick: () => { store.setArea(a.id); },
        ondblclick: () => renameTab(tab, a),
      }, a.name || 'Untitled');
      return tab;
    });
    tabs.replaceChildren(...items, iconBtn(UI_ICONS.plus, 'Add area', addArea, { class: 'tab-add' }));
  }

  function renameTab(tab: HTMLElement, a: Area) {
    const inp = h('input', { class: 'tab-input', value: a.name, spellcheck: false });
    tab.replaceWith(inp);
    inp.focus(); inp.select();
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      if (commit && inp.value.trim() && inp.value !== a.name) store.edit(() => { a.name = inp.value.trim(); });
      else renderTabs();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
  }

  function addArea() {
    store.edit(() => {
      const a = createArea(store.project, `Area ${store.project.areas.length + 1}`);
      const cur = store.area;
      a.cols = cur.cols; a.rows = cur.rows; a.cellW = cur.cellW; a.cellH = cur.cellH;
      store.project.areas.push(a);
      store.areaId = a.id;
      store.selection = null;
      store.activeRoomId = null;
    });
  }

  function duplicateArea() {
    const src = store.area;
    store.edit(() => {
      const p = store.project;
      const copy: Area = JSON.parse(JSON.stringify(src));
      copy.id = newId(p, 'A');
      copy.name = `${src.name} copy`;
      for (const r of copy.rooms) r.id = newId(p, 'R');
      for (const l of copy.labels) l.id = newId(p, 'L');
      for (const m of copy.markers) m.id = newId(p, 'M');
      p.areas.splice(p.areas.indexOf(src) + 1, 0, copy);
      store.areaId = copy.id;
      store.selection = null;
      store.activeRoomId = null;
    });
  }

  function deleteArea() {
    const p = store.project;
    if (p.areas.length < 2) return;
    const a = store.area;
    if (a.rooms.length && !confirm(`Delete area “${a.name}” and its ${a.rooms.length} rooms? (You can undo this.)`)) return;
    store.edit(() => {
      const i = p.areas.indexOf(a);
      p.areas.splice(i, 1);
      store.areaId = p.areas[Math.max(0, i - 1)].id;
      store.selection = null;
      store.activeRoomId = null;
    });
  }

  // ---------- commands ----------
  function deleteSelection() {
    const a = store.area;
    const sel = store.selection;
    if (!sel) return;
    store.edit(() => {
      if (sel.kind === 'room') {
        const r = a.rooms.find((x) => x.id === sel.id);
        if (r) {
          const cells = new Set(r.cells);
          a.markers = a.markers.filter((m) => !cells.has(`${m.x},${m.y}`));
          a.rooms = a.rooms.filter((x) => x !== r);
        }
      } else if (sel.kind === 'label') a.labels = a.labels.filter((x) => x.id !== sel.id);
      else a.markers = a.markers.filter((x) => x.id !== sel.id);
      store.selection = null;
    });
  }

  function nudgeSelection(dx: number, dy: number) {
    const a = store.area;
    const sel = store.selection;
    if (!sel) return false;
    if (sel.kind === 'room') {
      const r = a.rooms.find((x) => x.id === sel.id);
      if (r && canMoveRoom(a, store.idx, r, dx, dy)) store.edit(() => moveRoom(a, r, dx, dy));
    } else if (sel.kind === 'label') {
      const l = a.labels.find((x) => x.id === sel.id);
      if (l) store.edit(() => { l.x += dx * 0.25; l.y += dy * 0.25; });
    } else {
      const m = a.markers.find((x) => x.id === sel.id);
      if (m && !store.idx.markers.has(`${m.x + dx},${m.y + dy}`)) store.edit(() => { m.x += dx; m.y += dy; });
    }
    return true;
  }

  function newProject() {
    store.replaceProject(createProject());
    editor.fit();
    toast('New project created. Undo (Ctrl+Z) brings the old one back.');
  }

  async function openProject() {
    const f = await pickProjectFile();
    if (f) await loadFile(f);
  }

  async function loadFile(f: File) {
    try {
      const p = await readProjectFile(f);
      store.replaceProject(p);
      editor.fit();
      toast(`Opened “${p.name}”`);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }

  function showExport() {
    const opts = { scale: 2, grid: store.showGrid, crop: true, transparent: false };
    const preview = h('div', { class: 'export-preview' });
    const info = h('div', { class: 'muted small' });
    const refresh = () => {
      const c = renderPng(opts);
      info.textContent = `${c.width} × ${c.height} px`;
      c.className = 'checker';
      preview.replaceChildren(c);
    };
    const check = (label: string, key: 'grid' | 'crop' | 'transparent') =>
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: opts[key], onchange: (e: Event) => { opts[key] = (e.target as HTMLInputElement).checked; refresh(); } }), label);
    const scaleSeg = h('div', { class: 'seg' }, ...[1, 2, 4].map((s) => {
      const b = h('button', {
        class: 'seg-btn' + (s === opts.scale ? ' active' : ''),
        onclick: () => { opts.scale = s; scaleSeg.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === b)); refresh(); },
      }, `${s}×`);
      return b;
    }));
    const body = h('div', { class: 'export' },
      preview,
      h('div', { class: 'export-opts' },
        field('Scale', scaleSeg),
        check('Grid lines', 'grid'), check('Crop to content', 'crop'), check('Transparent background', 'transparent'),
        info,
      ),
    );
    const m = modal(`Export “${store.area.name}” as PNG`, body, [
      h('button', { class: 'btn primary', onclick: () => { exportPng(opts); m.close(); } }, svgIcon(UI_ICONS.save, 16), 'Download PNG'),
    ]);
    refresh();
  }

  function showHelp() {
    const rows: [string, string][] = [
      ['V R E D M T', 'Select, Room, Erase, Door, Marker, Text tools'],
      ['N', 'Start a new room with the next stroke'],
      ['Shift + drag', 'Fill or erase a rectangle'],
      ['Right-drag', 'Erase (room tool) / remove (door, marker)'],
      ['Space + drag, middle-drag', 'Pan'],
      ['Wheel, + / −', 'Zoom'],
      ['F', 'Fit map to view'],
      ['Arrow keys', 'Nudge selected room, marker or label'],
      ['Delete', 'Delete selection'],
      ['Esc', 'Deselect / cancel new room'],
      ['G  L  I', 'Toggle grid, names, IDs'],
      ['Ctrl+Z  Ctrl+Shift+Z', 'Undo / redo'],
      ['Ctrl+S  Ctrl+O  Ctrl+E', 'Save, open, export PNG'],
      ['PgUp / PgDn', 'Previous / next area'],
    ];
    modal('Maproid', h('div', { class: 'help' },
      h('p', {}, 'Paint cells to draw rooms. Cells you paint next to the active room join it. Painting away from it starts a new room. Every room gets a unique ID. Your work autosaves in this browser. Use Save to keep a file.'),
      h('table', {}, ...rows.map(([k, v]) => h('tr', {}, h('td', {}, ...k.split('  ').map((s) => h('kbd', {}, s))), h('td', {}, v)))),
    ));
  }

  // ---------- keyboard ----------
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const typing = isTypingTarget(e.target);
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveProjectFile(); return; }
    if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openProject(); return; }
    if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); showExport(); return; }
    if (typing || document.querySelector('.modal-backdrop')) return;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); return; }
    if (mod || e.altKey) return;
    const k = e.key;
    const tool = TOOLS.find((t) => t.key.toLowerCase() === k.toLowerCase());
    if (tool) { store.setTool(tool.id); return; }
    switch (k) {
      case 'b': case 'B': store.setTool('room'); break;
      case 'n': case 'N':
        store.pendingNewRoom = true;
        if (store.tool !== 'room') store.setTool('room'); else store.emit('ui');
        break;
      case 'Escape':
        if (store.pendingNewRoom) { store.pendingNewRoom = false; store.emit('ui'); } else store.select(null);
        break;
      case 'Delete': case 'Backspace': deleteSelection(); break;
      case 'f': case 'F': case '0': editor.fit(); break;
      case '+': case '=': editor.zoomBy(1.25); break;
      case '-': case '_': editor.zoomBy(0.8); break;
      case 'g': case 'G': store.showGrid = !store.showGrid; store.savePrefs(); store.emit('ui'); break;
      case 'l': case 'L': store.showNames = !store.showNames; store.savePrefs(); store.emit('ui'); break;
      case 'i': case 'I': store.showIds = !store.showIds; store.savePrefs(); store.emit('ui'); break;
      case '?': showHelp(); break;
      case 'PageUp': case 'PageDown': {
        const as = store.project.areas;
        const i = as.findIndex((a) => a.id === store.areaId);
        store.setArea(as[(i + (k === 'PageUp' ? -1 : 1) + as.length) % as.length].id);
        break;
      }
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k]!;
        if (nudgeSelection(d[0], d[1])) e.preventDefault();
        break;
      }
      default: return;
    }
  });

  // Drag & drop project files
  window.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dropping'); });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('dropping');
    const f = e.dataTransfer?.files?.[0];
    if (f) loadFile(f);
  });
  window.addEventListener('beforeunload', () => store.saveLocal());

  // ---------- wiring ----------
  const refreshChrome = () => {
    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();
    zoomEl.textContent = `${Math.round(editor.view.zoom * 100)}%`;
    if (document.activeElement !== nameInput) nameInput.value = store.project.name;
    document.title = `${store.project.name} · Maproid`;
  };
  let lastArea = store.areaId;
  store.subscribe((why) => {
    if (why === 'view') { zoomEl.textContent = `${Math.round(editor.view.zoom * 100)}%`; return; }
    if (why !== 'inspector') {
      renderToolbar(); renderOptions(); renderInspector(); renderTabs();
    }
    refreshChrome();
    if (store.areaId !== lastArea) { lastArea = store.areaId; zoomEl.textContent = `${Math.round(editor.view.zoom * 100)}%`; }
    editor.request();
  });
  renderToolbar(); renderOptions(); renderInspector(); renderTabs(); refreshChrome();
  editor.request();
}

// ---------- small builders ----------
function panel(title: string, children: Node[], badge?: string) {
  return h('section', { class: 'panel' },
    h('h3', {}, h('span', {}, title), badge ? h('code', { class: 'badge' }, badge) : null),
    ...children);
}

function field(label: string, control: HTMLElement) {
  // Only wrap form inputs in <label>; a label around buttons would forward stray clicks to the first one.
  const tag = control.tagName === 'INPUT' || control.tagName === 'TEXTAREA' ? 'label' : 'div';
  if (tag === 'div') control.setAttribute('aria-label', label);
  return h(tag, { class: 'field' }, h('span', { class: 'field-label' }, label), control);
}

function stat(label: string, v: string | number) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat-v' }, String(v)), h('span', { class: 'stat-l' }, label));
}

function dangerBtn(label: string, onclick: () => void, disabled = false) {
  return h('button', { class: 'btn danger', onclick, disabled }, svgIcon(UI_ICONS.trash, 16), label);
}

function swatches(colors: string[], current: string, pick: (c: string) => void, custom = false) {
  const lower = current.toLowerCase();
  const wrap = h('div', { class: 'swatches', role: 'radiogroup' }, ...colors.map((c) =>
    h('button', {
      class: 'swatch' + (c.toLowerCase() === lower ? ' active' : ''), style: `--c:${c}`, title: c, 'aria-label': c,
      role: 'radio', 'aria-checked': String(c.toLowerCase() === lower), onclick: () => pick(c),
    })));
  if (custom) {
    const isCustom = !colors.some((c) => c.toLowerCase() === lower);
    const inp = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(current) ? current : '#888888', title: 'Custom color' });
    inp.addEventListener('change', () => pick(inp.value));
    wrap.append(h('label', { class: 'swatch custom' + (isCustom ? ' active' : ''), style: isCustom ? `--c:${current}` : '', title: 'Custom color' }, inp));
  }
  return wrap;
}

function sizeSelect(current: number, pick: (v: number) => void) {
  const sizes: [number, string][] = [[0.35, 'XS'], [0.5, 'S'], [0.7, 'M'], [1, 'L'], [1.5, 'XL'], [2.5, 'Huge']];
  const seg = h('div', { class: 'seg' }, ...sizes.map(([v, n]) =>
    h('button', { class: 'seg-btn' + (Math.abs(v - current) < 0.01 ? ' active' : ''), onclick: () => pick(v) }, n)));
  return seg;
}

function doorChip(id: string, color: string) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 20 12');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '12');
  const wall = document.createElementNS(ns, 'path');
  wall.setAttribute('d', 'M1 6h4 M15 6h4');
  wall.setAttribute('stroke', '#e9f2ff');
  wall.setAttribute('stroke-width', '2.5');
  svg.append(wall);
  if (id === 'secret') {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', 'M6 6h8');
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-dasharray', '2 1.5');
    svg.append(p);
  } else if (id !== 'open') {
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', '5.5'); r.setAttribute('y', '3.5'); r.setAttribute('width', '9'); r.setAttribute('height', '5');
    r.setAttribute('fill', color);
    svg.append(r);
  }
  return svg;
}

function logoMark() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.innerHTML = '<rect x="2" y="2" width="9" height="6" fill="#3d5fa8" stroke="#e9f2ff" stroke-width="1.6"/>'
    + '<rect x="11" y="2" width="11" height="6" fill="#2f8a73" stroke="#e9f2ff" stroke-width="1.6"/>'
    + '<rect x="2" y="8" width="6" height="14" fill="#a8434d" stroke="#e9f2ff" stroke-width="1.6"/>'
    + '<rect x="8" y="14" width="14" height="8" fill="#7350ad" stroke="#e9f2ff" stroke-width="1.6"/>'
    + '<rect x="15" y="11" width="3" height="6" fill="#3ee0ff"/>';
  return svg;
}

/** Bind a text input/textarea to a model field, recording one undo step per focus session. */
function bindText(el: HTMLInputElement | HTMLTextAreaElement, get: () => string, set: (v: string) => void) {
  el.value = get();
  el.addEventListener('focus', () => store.beginEdit());
  el.addEventListener('input', () => { set(el.value); store.emit('inspector'); });
  el.addEventListener('blur', () => store.endEdit());
  el.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Escape' || (ke.key === 'Enter' && el.tagName === 'INPUT')) { ke.preventDefault(); el.blur(); }
  });
}

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'color'].includes(type);
  }
  return el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

