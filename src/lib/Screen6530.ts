// ─── HP 6530 Screen Buffer & Multi-Page Engine ───
// Implements the 80×24 multi-page screen buffer, page registers (Select Page / Display Page),
// separate buffer vs. cursor addressing, per-cell field tracking, and LRC-framed block-mode
// responses required for full Tandem / HP NonStop 6530 (TN6530) protocol compliance
// (TEDIT, EDIT, Pathway, DBU, etc.).

// ─── Constants ───
export const SCREEN_ROWS = 24;
export const SCREEN_COLS = 80;
export const MAX_PAGES = 8; // Page 0 (blank/hidden) + Pages 1..7

// Field separator used between fields in WRITEREAD response
const FIELD_SEPARATOR = '\x1c'; // FS (0x1C) — standard 6530 field separator

// ─── Types ───
export interface ScreenCell {
  char: string;        // The character at this position
  protected: boolean;  // true = protected (user can't type here)
  fieldId: number;     // -1 = no field, 0+ = unprotected field index
  attribute: number;   // 6530 display attribute bitmask
  modified: boolean;   // true if user has modified this cell (MDT)
}

export interface Field {
  id: number;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  length: number;
  mdt: boolean;        // Modified Data Tag
  protected?: boolean; // true = protected field, false = unprotected field
  attrRow?: number;    // Row of start-field attribute byte (GS / ESC [)
  attrCol?: number;    // Col of start-field attribute byte (GS / ESC [)
  videoAttr?: number;  // 6530 video attribute (bits 0..4)
  dataAttr?: number;   // 6530 data attribute byte
  extAttr?: number;    // 6530 extended data attribute byte
}

export interface PageState {
  buffer: ScreenCell[][];
  fields: Field[];     // Unprotected fields on this page
  allFields: Field[];  // All fields (protected + unprotected) defined via GS / ESC [ / FS
  cursorRow: number;
  cursorCol: number;
  bufferRow: number;
  bufferCol: number;
  currentProtected: boolean;
  currentFieldId: number;
  currentAttribute: number;
  nextFieldId: number;
}

// Fixed Field Definitions Table (Table 3-9, 6530 Programmer's Guide pp. 3-86..3-87)
const FIXED_D1_CYCLE = [0x40, 0x41, 0x48, 0x49, 0x60, 0x61, 0x68, 0x69];
const FIXED_VA_BY_GROUP = [0x20, 0x21, 0x28, 0x29, 0x22, 0x23, 0x2a, 0x2b];

function getFixedFieldDef(index: number): { va: number; d1: number; d2: number } {
  const ix = Math.max(0, Math.min(63, index));
  const va = FIXED_VA_BY_GROUP[Math.floor(ix / 8)] ?? 0x20;
  const d1 = FIXED_D1_CYCLE[ix % 8];
  return { va, d1, d2: 0x44 };
}

function createDefaultVariableFieldTable(): Array<{ va: number; d1: number; d2: number }> {
  const table: Array<{ va: number; d1: number; d2: number }> = [];
  for (let ix = 0; ix < 32; ix++) {
    if (ix < 8) {
      table.push({ va: 0x20, d1: FIXED_D1_CYCLE[ix], d2: 0x44 });
    } else if (ix === 8) {
      table.push({ va: 0x20, d1: 0x40, d2: 0x44 });
    } else if (ix === 9) {
      table.push({ va: 0x20, d1: 0x41, d2: 0x44 });
    } else if (ix === 10) {
      table.push({ va: 0x20, d1: 0x48, d2: 0x44 });
    } else {
      table.push({ va: 0x20, d1: 0x50, d2: 0x44 });
    }
  }
  return table;
}

// ─── Screen6530 Class ───
export class Screen6530 {
  pages: PageState[];
  selectedPage: number;      // I/O write/read page register (set by ESC : <page>), default 1
  displayPage: number;       // Displayed page register (set by ESC ; <page>), default 1
  maxPages: number;          // Max allocated pages in block mode (set by ESC p <n>), default 7
  blockMode: boolean;        // true after SOH B ETX LRC or ESC W
  protectSubmode: boolean;   // true after ESC W
  keyboardLocked: boolean;   // true after ESC c or block submission; false after ESC b
  statusLine: string;        // 25th row message/status line
  variableFieldTable: { va: number; d1: number; d2: number }[];

  constructor() {
    this.pages = [];
    this.selectedPage = 1;
    this.displayPage = 1;
    this.maxPages = 7;
    this.blockMode = false;
    this.protectSubmode = false;
    this.keyboardLocked = false;
    this.statusLine = '';
    this.variableFieldTable = createDefaultVariableFieldTable();
    this._initAllPages();
  }

  // ─── Page Helpers ───
  private _createEmptyPage(defaultProtected = false): PageState {
    const buffer: ScreenCell[][] = [];
    for (let r = 0; r < SCREEN_ROWS; r++) {
      const row: ScreenCell[] = [];
      for (let c = 0; c < SCREEN_COLS; c++) {
        row.push({
          char: ' ',
          protected: defaultProtected,
          fieldId: -1,
          attribute: 0,
          modified: false,
        });
      }
      buffer.push(row);
    }
    return {
      buffer,
      fields: [],
      allFields: [],
      cursorRow: 0,
      cursorCol: 0,
      bufferRow: 0,
      bufferCol: 0,
      currentProtected: defaultProtected,
      currentFieldId: -1,
      currentAttribute: 0,
      nextFieldId: 0,
    };
  }

  private _initAllPages(defaultProtected = false): void {
    this.pages = [];
    for (let p = 0; p < MAX_PAGES; p++) {
      this.pages.push(this._createEmptyPage(defaultProtected));
    }
  }

  private get _activeWritePage(): PageState {
    const idx = Math.max(0, Math.min(MAX_PAGES - 1, this.selectedPage));
    return this.pages[idx];
  }

  private get _activeDisplayPage(): PageState {
    const idx = Math.max(0, Math.min(MAX_PAGES - 1, this.displayPage));
    return this.pages[idx];
  }

  // ─── Backward-Compatible Getters/Setters (delegate to selected page) ───
  get buffer(): ScreenCell[][] {
    return this._activeWritePage.buffer;
  }
  set buffer(val: ScreenCell[][]) {
    this._activeWritePage.buffer = val;
  }

  get fields(): Field[] {
    return this._activeWritePage.fields;
  }
  set fields(val: Field[]) {
    this._activeWritePage.fields = val;
  }

  get cursorRow(): number {
    return this._activeWritePage.cursorRow;
  }
  set cursorRow(val: number) {
    this._activeWritePage.cursorRow = val;
  }

  get cursorCol(): number {
    return this._activeWritePage.cursorCol;
  }
  set cursorCol(val: number) {
    this._activeWritePage.cursorCol = val;
  }

  get bufferRow(): number {
    return this._activeWritePage.bufferRow;
  }
  set bufferRow(val: number) {
    this._activeWritePage.bufferRow = val;
  }

  get bufferCol(): number {
    return this._activeWritePage.bufferCol;
  }
  set bufferCol(val: number) {
    this._activeWritePage.bufferCol = val;
  }

  get currentProtected(): boolean {
    return this._activeWritePage.currentProtected;
  }
  set currentProtected(val: boolean) {
    this._activeWritePage.currentProtected = val;
  }

  get currentFieldId(): number {
    return this._activeWritePage.currentFieldId;
  }
  set currentFieldId(val: number) {
    this._activeWritePage.currentFieldId = val;
  }

  // ─── LRC Checksum Calculation (6530 Spec) ───
  // XOR of all bytes after SOH/STX through and including ETX (0x03).
  static computeLRC(payloadWithEtx: string): string {
    let lrc = 0;
    for (let i = 0; i < payloadWithEtx.length; i++) {
      lrc ^= payloadWithEtx.charCodeAt(i) & 0xff;
    }
    return String.fromCharCode(lrc);
  }

  static frameBlockMessage(startChar: string, bodyWithoutEtx: string): string {
    const withEtx = bodyWithoutEtx + '\x03';
    return startChar + withEtx + Screen6530.computeLRC(withEtx);
  }

  // ─── Reset ───
  reset(): void {
    this._initAllPages(false);
    this.selectedPage = 1;
    this.displayPage = 1;
    this.protectSubmode = false;
    this.keyboardLocked = false;
    this.statusLine = '';
    this.variableFieldTable = createDefaultVariableFieldTable();
  }

  // ─── Clear Current Selected Page (ESC I / ESC K) ───
  clearSelectedPage(): void {
    const defaultProt = this.protectSubmode;
    this.pages[this.selectedPage] = this._createEmptyPage(defaultProt);
  }

  // ─── Clear Memory to Spaces (ESC I <sRow><sCol><eRow><eCol> or ESC - I) ───
  // Per 6530 Programmer's Guide Page 3-48:
  // In Protect Submode: clears unprotected field character positions in the range to spaces.
  // In Nonprotect Submode: clears all character positions and video attributes in the range to spaces.
  clearMemoryToSpaces(
    startRow = 0,
    startCol = 0,
    endRow = SCREEN_ROWS - 1,
    endCol = SCREEN_COLS - 1
  ): void {
    const page = this._activeWritePage;
    const sRow = Math.max(0, Math.min(SCREEN_ROWS - 1, startRow));
    const sCol = Math.max(0, Math.min(SCREEN_COLS - 1, startCol));
    const eRow = Math.max(0, Math.min(SCREEN_ROWS - 1, endRow));
    const eCol = Math.max(0, Math.min(SCREEN_COLS - 1, endCol));
    const sPos = sRow * SCREEN_COLS + sCol;
    const ePos = eRow * SCREEN_COLS + eCol;
    if (ePos < sPos) return;

    for (let pos = sPos; pos <= ePos; pos++) {
      const r = Math.floor(pos / SCREEN_COLS);
      const c = pos % SCREEN_COLS;
      const cell = page.buffer[r][c];
      if (this.protectSubmode) {
        if (!cell.protected && (page.allFields.length === 0 || cell.fieldId >= 0)) {
          cell.char = ' ';
          cell.modified = false;
        }
      } else {
        cell.char = ' ';
        cell.attribute = 0;
        cell.modified = false;
      }
    }
  }

  // ─── Page Register Operations (ESC : and ESC ;) ───
  selectWritePage(page: number): void {
    if (page >= 0 && page < MAX_PAGES) {
      this.selectedPage = page;
    }
  }

  selectDisplayPage(page: number): void {
    if (page >= 0 && page < MAX_PAGES) {
      this.displayPage = page;
      if (page === 0) {
        // Displaying page 0 locks keyboard and blanks display per 6530 spec
        this.keyboardLocked = true;
      }
    }
  }

  setMaxPages(maxPage: number): void {
    if (maxPage >= 1 && maxPage < MAX_PAGES) {
      this.maxPages = maxPage;
    } else if (maxPage >= MAX_PAGES) {
      this.maxPages = MAX_PAGES - 1;
    }
  }

  // ─── Enter Block Mode (SOH B ETX LRC) ───
  // Per 6530 Programmer's Guide:
  // Locks keyboard, sets nonprotect submode, selects & displays Page 1,
  // retains Page 1 data from conversational mode, clears Pages 2+, resets cursor & buffer to (0,0).
  enterBlockMode(): void {
    this.blockMode = true;
    this.protectSubmode = false;
    this.keyboardLocked = true;
    this.selectedPage = 1;
    this.displayPage = 1;

    const page1 = this.pages[1];
    page1.cursorRow = 0;
    page1.cursorCol = 0;
    page1.bufferRow = 0;
    page1.bufferCol = 0;
    page1.currentProtected = false;
    page1.currentFieldId = -1;
    page1.fields = [];
    page1.allFields = [];
    page1.nextFieldId = 0;
    for (let r = 0; r < SCREEN_ROWS; r++) {
      for (let c = 0; c < SCREEN_COLS; c++) {
        page1.buffer[r][c].protected = false;
        page1.buffer[r][c].fieldId = -1;
        page1.buffer[r][c].modified = false;
      }
    }

    for (let p = 2; p < MAX_PAGES; p++) {
      this.pages[p] = this._createEmptyPage(false);
    }
  }

  // ─── Enter Conversational Mode (SOH C ETX LRC) ───
  enterConversationalMode(): void {
    this.blockMode = false;
    this.protectSubmode = false;
    this.keyboardLocked = false;
    this.selectedPage = 1;
    this.displayPage = 1;
    this._initAllPages(false);
  }

  // ─── Enter Protect Submode (ESC W) ───
  // Per 6530 spec: clears all pages to blanks (default protected), selects & displays Page 1,
  // sets buffer & cursor addresses to (0,0), locks keyboard.
  enterProtectSubmode(): void {
    this.protectSubmode = true;
    this.keyboardLocked = true;
    this.selectedPage = 1;
    this.displayPage = 1;
    this._initAllPages(true);
  }

  // ─── Exit Protect Submode (ESC X) ───
  // Exits protect submode back to nonprotect submode (still in Block Mode!), clears pages.
  exitProtectSubmode(): void {
    this.protectSubmode = false;
    this._initAllPages(false);
  }

  // ─── Recalculate Protect Submode Field Spans (6530 Spec Pages 3-1 to 3-3, 3-37 to 3-38) ───
  // In 6530 Protect Submode, each field starts at (attrPos + 1) and spans all character cells
  // up to (nextField.attrPos - 1), or up to the end of the page (row 23, col 79) for the last field.
  private _recalculateFieldSpans(page: PageState): void {
    if (page.allFields.length === 0) {
      page.fields = [];
      return;
    }

    const totalCells = SCREEN_ROWS * SCREEN_COLS;
    page.allFields.sort((a, b) => {
      const posA = (a.attrRow ?? a.startRow) * SCREEN_COLS + (a.attrCol ?? Math.max(0, a.startCol - 1));
      const posB = (b.attrRow ?? b.startRow) * SCREEN_COLS + (b.attrCol ?? Math.max(0, b.startCol - 1));
      return posA - posB;
    });

    // Positions before the first field attribute on the page are protected in Protect Submode
    const firstAttrPos =
      (page.allFields[0].attrRow ?? 0) * SCREEN_COLS + (page.allFields[0].attrCol ?? 0);
    for (let pos = 0; pos < Math.min(totalCells, firstAttrPos); pos++) {
      const r = Math.floor(pos / SCREEN_COLS);
      const c = pos % SCREEN_COLS;
      page.buffer[r][c].protected = true;
      page.buffer[r][c].fieldId = -1;
    }

    for (let i = 0; i < page.allFields.length; i++) {
      const field = page.allFields[i];
      const attrRow = field.attrRow ?? field.startRow;
      const attrCol = field.attrCol ?? Math.max(0, field.startCol - 1);
      const attrPos = attrRow * SCREEN_COLS + attrCol;

      if (attrRow >= 0 && attrRow < SCREEN_ROWS && attrCol >= 0 && attrCol < SCREEN_COLS) {
        const attrCell = page.buffer[attrRow][attrCol];
        attrCell.protected = true;
        attrCell.fieldId = -1;
        attrCell.attribute = (field.videoAttr ?? 0) & 0x1f;
      }

      const startPos = attrPos + 1;
      const nextField = i + 1 < page.allFields.length ? page.allFields[i + 1] : null;
      const nextAttrPos = nextField
        ? (nextField.attrRow ?? nextField.startRow) * SCREEN_COLS +
          (nextField.attrCol ?? Math.max(0, nextField.startCol - 1))
        : totalCells;
      const endPos = Math.min(totalCells - 1, nextAttrPos - 1);

      if (startPos < totalCells && endPos >= startPos) {
        field.startRow = Math.floor(startPos / SCREEN_COLS);
        field.startCol = startPos % SCREEN_COLS;
        field.endRow = Math.floor(endPos / SCREEN_COLS);
        field.endCol = endPos % SCREEN_COLS;
        field.length = endPos - startPos + 1;

        for (let pos = startPos; pos <= endPos; pos++) {
          const r = Math.floor(pos / SCREEN_COLS);
          const c = pos % SCREEN_COLS;
          const cell = page.buffer[r][c];
          cell.protected = Boolean(field.protected);
          cell.fieldId = field.protected ? -1 : field.id;
        }
      } else {
        field.startRow = Math.min(SCREEN_ROWS - 1, Math.floor(startPos / SCREEN_COLS));
        field.startCol = startPos % SCREEN_COLS;
        field.endRow = field.startRow;
        field.endCol = field.startCol;
        field.length = 0;
      }
    }

    page.fields = page.allFields.filter(f => !f.protected && f.length > 0);
  }

  // ─── Start Field in Protect Submode (GS 0x1D or ESC [) ───
  // Per 6530 Programmer's Guide Table 3-6:
  // dataAttr bit 5 (0x20): 1 = Protected, 0 = Unprotected (or bit 0 0x01 in legacy encodings)
  // dataAttr bit 0 (0x01) in 6530 Table 3-6 (when bit 6 0x40 is set): MDT pre-set, or bit 4 (0x10)
  startField(videoAttr: number, dataAttr: number, extAttr = 0): void {
    const page = this._activeWritePage;
    if (page.allFields.length === 0 && page.fields.length > 0) {
      this._closeCurrentField();
    }

    // Check 6530 Table 3-6:
    // In 6530 Table 3-6, D1 has bit 6 = 1 (0x40..0x7F):
    //   Bit 5 (0x20): 1 = Protected, 0 = Unprotected (e.g., 0x40 = unprotected, 0x60 = protected)
    //   Bit 0 (0x01): 1 = MDT set (e.g., 0x41 = unprotected + MDT, 0x61 = protected + MDT)
    // Also support legacy tests where dataAttr < 0x40 uses bit 0 (0x01) for protected and bit 4 (0x10) for MDT.
    const isStandard6530Attr = (dataAttr & 0x40) !== 0;
    const isProtected = isStandard6530Attr
      ? (dataAttr & 0x20) !== 0
      : (dataAttr & 0x01) !== 0 || (dataAttr & 0x20) !== 0;
    const mdtSet = isStandard6530Attr
      ? (dataAttr & 0x01) !== 0 || (dataAttr & 0x10) !== 0
      : (dataAttr & 0x10) !== 0;

    const attrRow = page.bufferRow;
    const attrCol = page.bufferCol;

    // The field attribute position itself occupies 1 protected cell on screen
    page.currentAttribute = videoAttr & 0x1f;
    if (attrRow < SCREEN_ROWS && attrCol < SCREEN_COLS) {
      const attrCell = page.buffer[attrRow][attrCol];
      attrCell.char = ' ';
      attrCell.protected = true;
      attrCell.fieldId = -1;
      attrCell.attribute = videoAttr & 0x1f;
      attrCell.modified = false;
    }
    this._advanceBufferAddress();

    // Remove any existing field attribute at the exact same (attrRow, attrCol)
    const existingIdx = page.allFields.findIndex(
      f => f.attrRow === attrRow && f.attrCol === attrCol
    );
    const fieldId = existingIdx >= 0 ? page.allFields[existingIdx].id : page.nextFieldId++;

    const newField: Field = {
      id: fieldId,
      startRow: page.bufferRow,
      startCol: page.bufferCol,
      endRow: page.bufferRow,
      endCol: page.bufferCol,
      length: 1,
      mdt: mdtSet,
      protected: isProtected,
      attrRow,
      attrCol,
      videoAttr,
      dataAttr,
      extAttr,
    };

    if (existingIdx >= 0) {
      page.allFields[existingIdx] = newField;
    } else {
      page.allFields.push(newField);
    }

    page.currentProtected = isProtected;
    page.currentFieldId = isProtected ? -1 : fieldId;

    this._recalculateFieldSpans(page);

    if (!isProtected && page.bufferRow < SCREEN_ROWS && page.bufferCol < SCREEN_COLS) {
      page.buffer[page.bufferRow][page.bufferCol].modified = mdtSet;
    }
  }

  // ─── Define Field Attribute via Fixed/Variable Table (FS 0x1C <row> <col> <tableIdx>) ───
  // Per 6530 Programmer's Guide Page 3-38:
  // Sets buffer address to (row, col) and starts a field using fixed (0x20..0x3F) or variable (0x40..0x5F) table.
  defineFieldAttribute(row: number, col: number, tableParam: number): void {
    this.setBufferAddress(row, col);
    if (tableParam >= 0x40 && tableParam <= 0x5f) {
      const idx = tableParam - 0x40;
      const entry = this.variableFieldTable[idx] ?? { va: 0x20, d1: 0x40, d2: 0x44 };
      this.startField(entry.va, entry.d1, entry.d2);
    } else {
      const idx = Math.max(0, (tableParam - 0x20) & 0x1f);
      const entry = getFixedFieldDef(idx);
      this.startField(entry.va, entry.d1, entry.d2);
    }
  }

  // ─── Start Protected Field (ESC )) ───
  startProtected(): void {
    this._closeCurrentField();
    this.currentProtected = true;
    this.currentFieldId = -1;
  }

  // ─── Start Unprotected Field (ESC () ───
  startUnprotected(): void {
    const page = this._activeWritePage;
    page.currentProtected = false;
    const fieldId = page.nextFieldId++;
    page.currentFieldId = fieldId;
    page.fields.push({
      id: fieldId,
      startRow: page.bufferRow,
      startCol: page.bufferCol,
      endRow: page.bufferRow,
      endCol: page.bufferCol,
      length: 1,
      mdt: false,
      protected: false,
    });
    if (page.bufferRow < SCREEN_ROWS && page.bufferCol < SCREEN_COLS) {
      const cell = page.buffer[page.bufferRow][page.bufferCol];
      cell.fieldId = fieldId;
      cell.protected = false;
    }
  }

  private _closeCurrentField(): void {
    const page = this._activeWritePage;
    if (page.allFields.length > 0) {
      return;
    }
    if (page.currentFieldId >= 0) {
      const field = page.fields.find(f => f.id === page.currentFieldId);
      if (field) {
        if (
          page.bufferRow > field.startRow ||
          (page.bufferRow === field.startRow && page.bufferCol > field.startCol)
        ) {
          if (page.bufferCol > 0) {
            field.endRow = page.bufferRow;
            field.endCol = page.bufferCol - 1;
          } else if (page.bufferRow > 0) {
            field.endRow = page.bufferRow - 1;
            field.endCol = SCREEN_COLS - 1;
          }
        }
        field.length = this._calculateFieldLength(field);
      }
    }
  }

  private _calculateFieldLength(field: Field): number {
    if (field.startRow === field.endRow) {
      return field.endCol - field.startCol + 1;
    }
    let len = SCREEN_COLS - field.startCol;
    len += (field.endRow - field.startRow - 1) * SCREEN_COLS;
    len += field.endCol + 1;
    return Math.max(0, len);
  }

  // ─── Set Buffer Address (DC1 <row> <col> or ESC - C) ───
  setBufferAddress(row: number, col: number): void {
    const page = this._activeWritePage;
    if (page.allFields.length === 0) {
      this._closeCurrentField();
    }
    page.bufferRow = Math.max(0, Math.min(SCREEN_ROWS - 1, row));
    page.bufferCol = Math.max(0, Math.min(SCREEN_COLS - 1, col));
  }

  // ─── Set Cursor Position (DC3 <row> <col> or ESC = <row> <col>) ───
  setCursor(row: number, col: number): void {
    if (row === -99 && col === -99) return;
    const page = this._activeWritePage;

    if (row < 0 || col < 0) {
      if (row === -1) page.cursorRow = Math.max(0, page.cursorRow - 1);
      else if (row === -2) page.cursorRow = Math.min(SCREEN_ROWS - 1, page.cursorRow + 1);

      if (col === -1) page.cursorCol = Math.min(SCREEN_COLS - 1, page.cursorCol + 1);
      else if (col === -2) page.cursorCol = Math.max(0, page.cursorCol - 1);

      page.bufferRow = page.cursorRow;
      page.bufferCol = page.cursorCol;
      return;
    }

    page.cursorRow = Math.max(0, Math.min(SCREEN_ROWS - 1, row));
    page.cursorCol = Math.max(0, Math.min(SCREEN_COLS - 1, col));
    page.bufferRow = page.cursorRow;
    page.bufferCol = page.cursorCol;
  }

  // ─── Set Video Attribute (ESC 6 / ESC 7) ───
  setVideoAttribute(attr: number): void {
    this._activeWritePage.currentAttribute = attr & 0x1f;
  }

  // ─── Set Cursor Address Only (DC3 in Block Mode — does not move Buffer Address) ───
  // Per 6530 Programmer's Guide Page 3-14:
  // In Protect Submode, if the addressed position is protected, moves to the first position
  // of the next unprotected field on the page.
  setCursorOnly(row: number, col: number): void {
    const page = this._activeWritePage;
    const r = Math.max(0, Math.min(SCREEN_ROWS - 1, row));
    const c = Math.max(0, Math.min(SCREEN_COLS - 1, col));

    if (this.protectSubmode && page.allFields.length > 0 && page.fields.length > 0) {
      const cell = page.buffer[r][c];
      if (cell.protected || cell.fieldId < 0) {
        const targetPos = r * SCREEN_COLS + c;
        let chosen = page.fields[0];
        for (const f of page.fields) {
          const fStart = f.startRow * SCREEN_COLS + f.startCol;
          if (fStart >= targetPos) {
            chosen = f;
            break;
          }
        }
        page.cursorRow = chosen.startRow;
        page.cursorCol = chosen.startCol;
        return;
      }
    }

    page.cursorRow = r;
    page.cursorCol = c;
  }

  // ─── Write Character (Server Writing to Selected Page) ───
  writeServerChar(ch: string): void {
    const page = this._activeWritePage;
    if (page.bufferRow >= SCREEN_ROWS) return;

    if (ch === '\r') {
      page.bufferCol = 0;
      if (!this.blockMode) page.cursorCol = 0;
      return;
    }
    if (ch === '\n') {
      page.bufferRow = Math.min(SCREEN_ROWS - 1, page.bufferRow + 1);
      if (!this.blockMode) page.cursorRow = page.bufferRow;
      return;
    }
    if (ch === '\b') {
      if (page.bufferCol > 0) page.bufferCol--;
      if (!this.blockMode) page.cursorCol = page.bufferCol;
      return;
    }
    if (ch === '\t') {
      page.bufferCol = Math.min(SCREEN_COLS - 1, (Math.floor(page.bufferCol / 8) + 1) * 8);
      if (!this.blockMode) page.cursorCol = page.bufferCol;
      return;
    }
    if (ch.charCodeAt(0) < 0x20) {
      return;
    }

    const cell = page.buffer[page.bufferRow][page.bufferCol];
    cell.char = ch;
    cell.attribute = page.currentAttribute;
    cell.modified = false;

    if (!this.protectSubmode || page.allFields.length === 0) {
      cell.protected = page.currentProtected;
      cell.fieldId = page.currentFieldId;

      if (page.currentFieldId >= 0) {
        const field = page.fields.find(f => f.id === page.currentFieldId);
        if (field) {
          field.endRow = page.bufferRow;
          field.endCol = page.bufferCol;
          field.length = this._calculateFieldLength(field);
        }
      }
    }

    this._advanceBufferAddress();
  }

  // ─── Block Mode Line & Character Editing Operations (ESC L, ESC M, ESC O, ESC P) ───
  insertLine(): void {
    const page = this._activeWritePage;
    const row = page.bufferRow;
    if (row < 0 || row >= SCREEN_ROWS || this.protectSubmode) return;

    for (let r = SCREEN_ROWS - 1; r > row; r--) {
      for (let c = 0; c < SCREEN_COLS; c++) {
        page.buffer[r][c] = { ...page.buffer[r - 1][c] };
      }
    }
    for (let c = 0; c < SCREEN_COLS; c++) {
      page.buffer[row][c] = {
        char: ' ',
        protected: false,
        fieldId: -1,
        attribute: 0,
        modified: false,
      };
    }
    page.bufferCol = 0;
  }

  deleteLine(): void {
    const page = this._activeWritePage;
    const row = page.bufferRow;
    if (row < 0 || row >= SCREEN_ROWS || this.protectSubmode) return;

    for (let r = row; r < SCREEN_ROWS - 1; r++) {
      for (let c = 0; c < SCREEN_COLS; c++) {
        page.buffer[r][c] = { ...page.buffer[r + 1][c] };
      }
    }
    for (let c = 0; c < SCREEN_COLS; c++) {
      page.buffer[SCREEN_ROWS - 1][c] = {
        char: ' ',
        protected: false,
        fieldId: -1,
        attribute: 0,
        modified: false,
      };
    }
    page.bufferCol = 0;
  }

  insertChar(): void {
    const page = this._activeWritePage;
    const r = page.bufferRow;
    const c = page.bufferCol;
    if (r < 0 || r >= SCREEN_ROWS || c < 0 || c >= SCREEN_COLS) return;

    if (this.protectSubmode) {
      const cell = page.buffer[r][c];
      if (cell.protected || cell.fieldId < 0) return;
      const field = page.fields.find(f => f.id === cell.fieldId);
      if (!field) return;
      const startPos = r * SCREEN_COLS + c;
      const endPos = field.endRow * SCREEN_COLS + field.endCol;
      for (let pos = endPos; pos > startPos; pos--) {
        const dstR = Math.floor(pos / SCREEN_COLS);
        const dstC = pos % SCREEN_COLS;
        const srcR = Math.floor((pos - 1) / SCREEN_COLS);
        const srcC = (pos - 1) % SCREEN_COLS;
        page.buffer[dstR][dstC].char = page.buffer[srcR][srcC].char;
        page.buffer[dstR][dstC].modified = true;
      }
      page.buffer[r][c].char = ' ';
      page.buffer[r][c].modified = true;
      field.mdt = true;
    } else {
      for (let col = SCREEN_COLS - 1; col > c; col--) {
        page.buffer[r][col].char = page.buffer[r][col - 1].char;
        page.buffer[r][col].attribute = page.buffer[r][col - 1].attribute;
      }
      page.buffer[r][c].char = ' ';
    }
  }

  deleteChar(): void {
    const page = this._activeWritePage;
    const r = page.bufferRow;
    const c = page.bufferCol;
    if (r < 0 || r >= SCREEN_ROWS || c < 0 || c >= SCREEN_COLS) return;

    if (this.protectSubmode) {
      const cell = page.buffer[r][c];
      if (cell.protected || cell.fieldId < 0) return;
      const field = page.fields.find(f => f.id === cell.fieldId);
      if (!field) return;
      const startPos = r * SCREEN_COLS + c;
      const endPos = field.endRow * SCREEN_COLS + field.endCol;
      for (let pos = startPos; pos < endPos; pos++) {
        const dstR = Math.floor(pos / SCREEN_COLS);
        const dstC = pos % SCREEN_COLS;
        const srcR = Math.floor((pos + 1) / SCREEN_COLS);
        const srcC = (pos + 1) % SCREEN_COLS;
        page.buffer[dstR][dstC].char = page.buffer[srcR][srcC].char;
        page.buffer[dstR][dstC].modified = true;
      }
      page.buffer[field.endRow][field.endCol].char = ' ';
      page.buffer[field.endRow][field.endCol].modified = true;
      field.mdt = true;
    } else {
      for (let col = c; col < SCREEN_COLS - 1; col++) {
        page.buffer[r][col].char = page.buffer[r][col + 1].char;
        page.buffer[r][col].attribute = page.buffer[r][col + 1].attribute;
      }
      page.buffer[r][SCREEN_COLS - 1].char = ' ';
    }
  }

  private _advanceBufferAddress(): void {
    const page = this._activeWritePage;
    page.bufferCol++;
    if (page.bufferCol >= SCREEN_COLS) {
      page.bufferCol = 0;
      page.bufferRow++;
      if (page.bufferRow >= SCREEN_ROWS) {
        page.bufferRow = SCREEN_ROWS - 1;
      }
    }
    if (!this.blockMode) {
      page.cursorRow = page.bufferRow;
      page.cursorCol = page.bufferCol;
    }
  }

  // ─── Write Character (User Input on Displayed Page) ───
  writeUserChar(ch: string): boolean {
    const page = this._activeDisplayPage;
    if (page.cursorRow >= SCREEN_ROWS) return false;

    const cell = page.buffer[page.cursorRow][page.cursorCol];

    if (this.protectSubmode) {
      if (cell.fieldId < 0) {
        if (page.currentFieldId >= 0 && !page.currentProtected) {
          cell.fieldId = page.currentFieldId;
          cell.protected = false;
          const field = page.fields.find(f => f.id === page.currentFieldId);
          if (field) {
            field.endRow = page.cursorRow;
            field.endCol = page.cursorCol;
            field.length = this._calculateFieldLength(field);
          }
        } else {
          return false;
        }
      } else if (cell.protected) {
        return false;
      }

      const field = page.fields.find(f => f.id === cell.fieldId);
      if (field) field.mdt = true;
    }

    cell.char = ch;
    cell.modified = true;

    const fieldId = cell.fieldId;
    this._advanceCursorOnPage(page);

    if (this.protectSubmode && page.currentFieldId === fieldId && !page.currentProtected && page.cursorRow < SCREEN_ROWS && page.cursorCol < SCREEN_COLS) {
      const nextCell = page.buffer[page.cursorRow][page.cursorCol];
      if (nextCell.fieldId < 0) {
        nextCell.fieldId = fieldId;
        nextCell.protected = false;
        const field = page.fields.find(f => f.id === fieldId);
        if (field) {
          field.endRow = page.cursorRow;
          field.endCol = page.cursorCol;
          field.length = this._calculateFieldLength(field);
        }
      }
    }

    return true;
  }

  // ─── Delete Character at Cursor (Backspace) ───
  deleteCharAtCursor(): boolean {
    const page = this._activeDisplayPage;
    if (page.cursorCol > 0) {
      page.cursorCol--;
    } else if (page.cursorRow > 0) {
      page.cursorRow--;
      page.cursorCol = SCREEN_COLS - 1;
    } else {
      return false;
    }

    const cell = page.buffer[page.cursorRow][page.cursorCol];

    if (this.protectSubmode) {
      if (cell.protected || cell.fieldId < 0) {
        this._advanceCursorOnPage(page);
        return false;
      }
      const field = page.fields.find(f => f.id === cell.fieldId);
      if (field) field.mdt = true;
    }

    cell.char = ' ';
    cell.modified = true;
    return true;
  }

  private _advanceCursorOnPage(page: PageState): void {
    page.cursorCol++;
    if (page.cursorCol >= SCREEN_COLS) {
      page.cursorCol = 0;
      page.cursorRow++;
      if (page.cursorRow >= SCREEN_ROWS) {
        page.cursorRow = SCREEN_ROWS - 1;
      }
    }
  }

  // ─── Erase Operations on Selected Page ───
  eraseToEndOfPage(): void {
    const page = this._activeWritePage;
    for (let r = page.bufferRow; r < SCREEN_ROWS; r++) {
      const startC = r === page.bufferRow ? page.bufferCol : 0;
      for (let c = startC; c < SCREEN_COLS; c++) {
        if (!this.protectSubmode || !page.buffer[r][c].protected) {
          page.buffer[r][c].char = ' ';
          page.buffer[r][c].modified = false;
        }
      }
    }
  }

  eraseToEndOfLine(): void {
    const page = this._activeWritePage;
    if (page.bufferRow >= SCREEN_ROWS) return;
    for (let c = page.bufferCol; c < SCREEN_COLS; c++) {
      if (!this.protectSubmode || !page.buffer[page.bufferRow][c].protected) {
        page.buffer[page.bufferRow][c].char = ' ';
        page.buffer[page.bufferRow][c].modified = false;
      }
    }
  }

  resetModifiedDataTags(): void {
    const page = this._activeWritePage;
    for (const f of page.fields) {
      f.mdt = false;
    }
    for (const f of page.allFields) {
      f.mdt = false;
    }
    for (let r = 0; r < SCREEN_ROWS; r++) {
      for (let c = 0; c < SCREEN_COLS; c++) {
        page.buffer[r][c].modified = false;
      }
    }
  }

  // ─── Tab Navigation ───
  tabToNextField(): { row: number; col: number } | null {
    const page = this._activeDisplayPage;
    if (page.fields.length === 0) {
      page.cursorCol = Math.min(SCREEN_COLS - 1, (Math.floor(page.cursorCol / 8) + 1) * 8);
      return { row: page.cursorRow, col: page.cursorCol };
    }

    let currentIdx = -1;
    for (let i = 0; i < page.fields.length; i++) {
      if (this._posInField(page.cursorRow, page.cursorCol, page.fields[i])) {
        currentIdx = i;
        break;
      }
    }

    let nextIdx: number;
    if (currentIdx >= 0) {
      nextIdx = (currentIdx + 1) % page.fields.length;
    } else {
      nextIdx = 0;
      for (let i = 0; i < page.fields.length; i++) {
        const f = page.fields[i];
        if (f.startRow > page.cursorRow || (f.startRow === page.cursorRow && f.startCol > page.cursorCol)) {
          nextIdx = i;
          break;
        }
      }
    }

    const nextField = page.fields[nextIdx];
    page.cursorRow = nextField.startRow;
    page.cursorCol = nextField.startCol;
    return { row: page.cursorRow, col: page.cursorCol };
  }

  tabToPrevField(): { row: number; col: number } | null {
    const page = this._activeDisplayPage;
    if (page.fields.length === 0) {
      page.cursorCol = Math.max(0, (Math.ceil(page.cursorCol / 8) - 1) * 8);
      return { row: page.cursorRow, col: page.cursorCol };
    }

    let currentIdx = -1;
    for (let i = 0; i < page.fields.length; i++) {
      if (this._posInField(page.cursorRow, page.cursorCol, page.fields[i])) {
        currentIdx = i;
        break;
      }
    }

    const prevIdx = currentIdx > 0 ? currentIdx - 1 : page.fields.length - 1;
    const prevField = page.fields[prevIdx];
    page.cursorRow = prevField.startRow;
    page.cursorCol = prevField.startCol;
    return { row: page.cursorRow, col: page.cursorCol };
  }

  private _posInField(row: number, col: number, field: Field): boolean {
    const pos = row * SCREEN_COLS + col;
    const start = field.startRow * SCREEN_COLS + field.startCol;
    const end = field.endRow * SCREEN_COLS + field.endCol;
    return pos >= start && pos <= end;
  }

  // ─── Collect Field Data ───
  collectFieldData(): string {
    const page = this._activeDisplayPage;
    if (page.fields.length === 0) return '';

    const fieldContents: string[] = [];
    for (const field of page.fields) {
      let content = '';
      let row = field.startRow;
      let col = field.startCol;

      while (row < SCREEN_ROWS) {
        const cell = page.buffer[row][col];
        if (cell.fieldId === field.id) {
          content += cell.char;
        } else if (row > field.endRow || (row === field.endRow && col > field.endCol)) {
          break;
        }
        col++;
        if (col >= SCREEN_COLS) {
          col = 0;
          row++;
        }
      }
      fieldContents.push(content.replace(/\s+$/, ''));
    }

    return fieldContents.join(FIELD_SEPARATOR);
  }

  collectModifiedFieldData(): string {
    const page = this._activeDisplayPage;
    if (page.fields.length === 0) return '';

    const parts: string[] = [];
    for (const field of page.fields) {
      let hasModified = field.mdt;
      let content = '';
      let row = field.startRow;
      let col = field.startCol;

      while (row < SCREEN_ROWS) {
        const cell = page.buffer[row][col];
        if (cell.fieldId === field.id) {
          content += cell.char;
          if (cell.modified) hasModified = true;
        } else if (row > field.endRow || (row === field.endRow && col > field.endCol)) {
          break;
        }
        col++;
        if (col >= SCREEN_COLS) {
          col = 0;
          row++;
        }
      }

      if (hasModified) {
        parts.push(content.replace(/\s+$/, ''));
      }
    }

    return parts.join(FIELD_SEPARATOR);
  }

  // ─── 6530 Host Query & Status Responses (Eliminates Guardian Error 180) ───

  // ESC ^ (Read Terminal Status)
  // Format per 6530 Programmer's Guide:
  //   Conversational Mode: SOH ? <status> <term-id> <maj-rev-level> CR (\x01?@FB\r)
  //   Block Mode:          SOH ? <status> <term-id> <maj-rev-level> <max-page> <fields1> <fields2> ETX LRC
  generateStatusResponse(isBlockMode = this.blockMode): string {
    // status = '@' (0x40: normal ready), term-id = 'F' (6530), maj-rev = 'B' (B30/B40)
    if (isBlockMode) {
      const maxPageChar = String.fromCharCode(0x30 + Math.max(1, Math.min(7, this.maxPages)));
      // 'X' (0x58) and 'Y' (0x59) encode 1561 available fields per page (standard 6530 Guide value)
      return Screen6530.frameBlockMessage('\x01', `?@FB${maxPageChar}XY`);
    }
    return '\x01?@FB\r';
  }

  // ESC _ (Read Full Revision Level)
  // Format: SOH # <rev-level> T0 <device-rev-level> CR (or ETX LRC in Block Mode)
  generateRevisionResponse(isBlockMode = this.blockMode): string {
    const body = '#C00T0A00';
    if (isBlockMode) {
      return Screen6530.frameBlockMessage('\x01', body);
    }
    return '\x01' + body + '\r';
  }

  // ESC ? (Read Terminal Configuration)
  // Format per 6530 Programmer's Guide Table 2-4 / Table 3-5:
  //   SOH ! <3-byte code/value pairs> CR (or ETX LRC in Block Mode)
  //   Each parameter is a 1-byte code followed by a 2-char space-padded decimal value.
  generateConfigResponse(isBlockMode = this.blockMode): string {
    const body = '!A 1B72C 0D 0G 0H15T 0U72h00';
    if (isBlockMode) {
      return Screen6530.frameBlockMessage('\x01', body);
    }
    return '\x01' + body + '\r';
  }

  // ESC - u / ESC - ? (Read 6530 Color / Extended Configuration)
  generateColorConfigResponse(isBlockMode = this.blockMode): string {
    const body = '_e7';
    if (isBlockMode) {
      return Screen6530.frameBlockMessage('\x01', body);
    }
    return '\x01' + body + '\r';
  }

  // ESC a (Read Cursor Address)
  // Format per 6530 Programmer's Guide:
  //   Conversational: SOH _ ! <row> <col> CR  ('!' = 0x21 = Page 1)
  //   Block Mode:     SOH _ <page> <row> <col> ETX LRC
  generateCursorAddressResponse(isBlockMode = this.blockMode, row?: number, col?: number): string {
    const page = this._activeWritePage;
    const r = Math.min(SCREEN_ROWS - 1, Math.max(0, row ?? page.cursorRow));
    const c = Math.min(SCREEN_COLS - 1, Math.max(0, col ?? page.cursorCol));
    const rowChar = String.fromCharCode(r + 0x20);
    const colChar = String.fromCharCode(c + 0x20);
    if (isBlockMode) {
      const pageChar = String.fromCharCode(Math.max(1, this.selectedPage) + 0x20);
      return Screen6530.frameBlockMessage('\x01', `_${pageChar}${rowChar}${colChar}`);
    }
    return `\x01_!${rowChar}${colChar}\r`;
  }

  // ─── Read Buffer (ESC <), Read With Address (ESC = / ESC - J), Read With Address All (ESC ] / ESC - K) ───
  // Reads from selectedPage between (startRow, startCol) and (endRow, endCol) per 6530 Spec Pages 3-41 to 3-47.
  generateReadBufferResponse(
    withAddress: boolean,
    startRow = 0,
    startCol = 0,
    endRow = SCREEN_ROWS - 1,
    endCol = SCREEN_COLS - 1,
    readAllFields = false
  ): string {
    const page = this._activeWritePage;
    const sRow = Math.max(0, Math.min(SCREEN_ROWS - 1, startRow));
    const sCol = Math.max(0, Math.min(SCREEN_COLS - 1, startCol));
    const eRow = Math.max(0, Math.min(SCREEN_ROWS - 1, endRow));
    const eCol = Math.max(0, Math.min(SCREEN_COLS - 1, endCol));

    if (eRow < sRow || (eRow === sRow && eCol < sCol)) {
      return Screen6530.frameBlockMessage('\x02', '');
    }

    const candidateFields =
      !withAddress
        ? page.fields
        : page.allFields.length > 0
          ? page.allFields
          : page.fields;

    if (this.protectSubmode && candidateFields.length > 0) {
      // Protect Submode (6530 Programmer's Guide Pages 3-41 to 3-47):
      // - ESC < (withAddress = false): transmits all unprotected fields in range, regardless of MDT.
      // - ESC = / ESC - J (withAddress = true, readAllFields = false): transmits all fields in range whose MDT is set.
      // - ESC ] / ESC - K (withAddress = true, readAllFields = true): transmits all defined fields in range, regardless of MDT.
      // Every transmitted field is preceded by DC1 (0x11) + 2-byte normal address of the first character position,
      // and trailing spaces are stripped from each field.
      let body = '';
      const rStart = sRow * SCREEN_COLS + sCol;
      const rEnd = eRow * SCREEN_COLS + eCol;

      for (const field of candidateFields) {
        if (field.length <= 0) continue;
        const fStart = field.startRow * SCREEN_COLS + field.startCol;
        const fEnd = field.endRow * SCREEN_COLS + field.endCol;
        if (fStart < rStart || fStart > rEnd) continue;

        let hasMod = field.mdt;
        let content = '';
        for (let pos = fStart; pos <= Math.min(SCREEN_ROWS * SCREEN_COLS - 1, fEnd); pos++) {
          const r = Math.floor(pos / SCREEN_COLS);
          const c = pos % SCREEN_COLS;
          const cell = page.buffer[r][c];
          content += cell.char;
          if (cell.modified) hasMod = true;
        }

        const shouldTransmit = !withAddress || readAllFields || hasMod;
        if (shouldTransmit) {
          const trimmed = content.replace(/\s+$/, '');
          const rChar = String.fromCharCode(field.startRow + 0x20);
          const cChar = String.fromCharCode(field.startCol + 0x20);
          body += `\x11${rChar}${cChar}${trimmed}`;
        }
      }
      return Screen6530.frameBlockMessage('\x02', body);
    }

    // Nonprotect Submode (6530 Programmer's Guide Pages 3-41 to 3-46):
    // Transmit lines in range [sRow..eRow, sCol..eCol] with trailing spaces stripped, separated by CR (0x0D).
    const lines: string[] = [];
    for (let r = sRow; r <= eRow; r++) {
      const cStart = r === sRow ? sCol : 0;
      const cEnd = r === eRow ? eCol : SCREEN_COLS - 1;
      let line = '';
      for (let c = cStart; c <= cEnd; c++) {
        line += page.buffer[r][c].char;
      }
      lines.push(line.replace(/\s+$/, ''));
    }

    const body = lines.join('\r');
    return Screen6530.frameBlockMessage('\x02', body);
  }

  // ─── Read Screen With All Attributes (ESC Q <sRow><sCol><eRow><eCol>, 6530 Spec Page 3-40) ───
  generateReadScreenWithAttributesResponse(
    startRow = 0,
    startCol = 0,
    endRow = SCREEN_ROWS - 1,
    endCol = SCREEN_COLS - 1
  ): string {
    const page = this._activeWritePage;
    const sRow = Math.max(0, Math.min(SCREEN_ROWS - 1, startRow));
    const sCol = Math.max(0, Math.min(SCREEN_COLS - 1, startCol));
    const eRow = Math.max(0, Math.min(SCREEN_ROWS - 1, endRow));
    const eCol = Math.max(0, Math.min(SCREEN_COLS - 1, endCol));

    if (eRow < sRow || (eRow === sRow && eCol < sCol)) {
      return Screen6530.frameBlockMessage('\x02', '');
    }

    const lines: string[] = [];
    for (let r = sRow; r <= eRow; r++) {
      const cStart = r === sRow ? sCol : 0;
      const cEnd = r === eRow ? eCol : SCREEN_COLS - 1;
      let line = '';
      let lastAttr = 0;
      for (let c = cStart; c <= cEnd; c++) {
        const attrField = this.protectSubmode
          ? page.allFields.find(f => f.attrRow === r && f.attrCol === c)
          : undefined;
        if (attrField) {
          const va = String.fromCharCode((attrField.videoAttr ?? 0x20) & 0x7f);
          const d1 = String.fromCharCode((attrField.dataAttr ?? 0x40) & 0x7f);
          line += `\x1d${va}${d1}`;
          lastAttr = (attrField.videoAttr ?? 0) & 0x1f;
          continue;
        }
        const cell = page.buffer[r][c];
        if (cell.attribute !== lastAttr) {
          line += `\x1b6${String.fromCharCode((cell.attribute & 0x1f) + 0x20)}`;
          lastAttr = cell.attribute;
        }
        line += cell.char;
      }
      lines.push(line.replace(/\s+$/, ''));
    }

    return Screen6530.frameBlockMessage('\x02', lines.join('\r'));
  }

  // ─── Generate Block Mode Function Key / Enter Response ───
  // Per 6530 Programmer's Guide Table 3-11:
  // When a function key (or Enter in block mode) is pressed:
  //   SOH <keycode> <page> <cursor_row> <cursor_col> [field_data] ETX LRC
  // Also preserves compatibility with legacy WRITEREAD callers when not in blockMode.
  generateWriteReadResponse(triggerKey?: string): string {
    const page = this._activeDisplayPage;
    const cursorRow = String.fromCharCode(page.cursorRow + 0x20);
    const cursorCol = String.fromCharCode(page.cursorCol + 0x20);
    const pageChar = String.fromCharCode(Math.max(1, this.displayPage) + 0x20);

    let keyChar = 'v'; // 'v' is standard 6530 Return/Enter keycode in Table 3-11
    let isEnter = true;
    if (triggerKey) {
      if (triggerKey.startsWith('\x1b') && triggerKey.length >= 2) {
        keyChar = triggerKey[1];
        isEnter = false;
      } else if (triggerKey.startsWith('\x01') && triggerKey.length >= 2) {
        keyChar = triggerKey[1];
        isEnter = false;
      } else if (triggerKey.length === 1 && triggerKey !== '\r' && triggerKey !== '\n') {
        keyChar = triggerKey;
        isEnter = false;
      }
    }

    // In 6530 Block Mode (both Nonprotect Submode for TEDIT/EDIT and Protect Submode for Pathway/forms):
    // Always send standard 6530 Block Function Key notification: SOH <keycode> <page> <row> <col> ETX <LRC>
    // The host will then issue ESC < (Read Buffer) or ESC = / ESC ] (Read With Address) to read data.
    if (this.blockMode) {
      this.keyboardLocked = true;
      return Screen6530.frameBlockMessage('\x01', `${keyChar}${pageChar}${cursorRow}${cursorCol}`);
    }

    const fieldData = this.collectFieldData();
    const prefix = isEnter ? '\x12' : '\x01' + keyChar;
    const response = prefix + cursorRow + cursorCol + fieldData + '\r';

    this._clearModifiedFlags();
    return response;
  }

  // ─── Render Active Display Page to ANSI for xterm.js ───
  renderDisplayPageToAnsi(): string {
    if (this.displayPage === 0) {
      return '\x1b[0m\x1b[2J\x1b[H';
    }
    const page = this._activeDisplayPage;
    let out = '\x1b[0m\x1b[2J\x1b[H';
    let lastAttr = 0;

    for (let r = 0; r < SCREEN_ROWS; r++) {
      out += `\x1b[${r + 1};1H`;
      for (let c = 0; c < SCREEN_COLS; c++) {
        const cell = page.buffer[r][c];
        const attr = cell.attribute | (cell.protected && this.protectSubmode ? 0x08 : 0);
        if (attr !== lastAttr) {
          const parts: string[] = ['0'];
          if (attr & 0x01) parts.push('4');
          if (attr & 0x02) parts.push('5');
          if (attr & 0x08) parts.push('2');
          if (attr & 0x10) parts.push('8');
          out += `\x1b[${parts.join(';')}m`;
          lastAttr = attr;
        }
        out += cell.char || ' ';
      }
    }
    out += `\x1b[0m\x1b[${page.cursorRow + 1};${page.cursorCol + 1}H`;
    return out;
  }

  // ─── Local Cursor Movement in Block Mode ───
  moveCursorLeft(): { row: number; col: number } | null {
    const page = this._activeDisplayPage;
    if (page.cursorCol > 0) {
      page.cursorCol--;
    } else if (page.cursorRow > 0) {
      page.cursorRow--;
      page.cursorCol = SCREEN_COLS - 1;
    } else {
      return null;
    }
    return { row: page.cursorRow, col: page.cursorCol };
  }

  moveCursorRight(): { row: number; col: number } | null {
    const page = this._activeDisplayPage;
    if (page.cursorCol < SCREEN_COLS - 1) {
      page.cursorCol++;
    } else if (page.cursorRow < SCREEN_ROWS - 1) {
      page.cursorRow++;
      page.cursorCol = 0;
    } else {
      return null;
    }
    return { row: page.cursorRow, col: page.cursorCol };
  }

  moveCursorUp(): { row: number; col: number } | null {
    const page = this._activeDisplayPage;
    if (page.cursorRow > 0) {
      page.cursorRow--;
      return { row: page.cursorRow, col: page.cursorCol };
    }
    return null;
  }

  moveCursorDown(): { row: number; col: number } | null {
    const page = this._activeDisplayPage;
    if (page.cursorRow < SCREEN_ROWS - 1) {
      page.cursorRow++;
      return { row: page.cursorRow, col: page.cursorCol };
    }
    return null;
  }

  homeCursor(): { row: number; col: number } | null {
    const page = this._activeDisplayPage;
    if (page.fields.length > 0) {
      page.cursorRow = page.fields[0].startRow;
      page.cursorCol = page.fields[0].startCol;
    } else {
      page.cursorRow = 0;
      page.cursorCol = 0;
    }
    return { row: page.cursorRow, col: page.cursorCol };
  }

  private _clearModifiedFlags(): void {
    const page = this._activeDisplayPage;
    for (let r = 0; r < SCREEN_ROWS; r++) {
      for (let c = 0; c < SCREEN_COLS; c++) {
        page.buffer[r][c].modified = false;
      }
    }
  }

  clearUnprotected(): void {
    const page = this._activeWritePage;
    for (let r = 0; r < SCREEN_ROWS; r++) {
      for (let c = 0; c < SCREEN_COLS; c++) {
        const cell = page.buffer[r][c];
        if (!cell.protected && (!this.protectSubmode || cell.fieldId >= 0)) {
          cell.char = ' ';
          cell.modified = false;
        }
      }
    }
  }

  getFieldAtCursor(): Field | null {
    const page = this._activeDisplayPage;
    for (const field of page.fields) {
      if (this._posInField(page.cursorRow, page.cursorCol, field)) {
        return field;
      }
    }
    return null;
  }

  isCursorProtected(): boolean {
    const page = this._activeDisplayPage;
    if (page.cursorRow >= SCREEN_ROWS || page.cursorCol >= SCREEN_COLS) return true;
    const cell = page.buffer[page.cursorRow][page.cursorCol];
    return cell.protected || (this.protectSubmode && cell.fieldId < 0);
  }

  toString(): string {
    const page = this._activeDisplayPage;
    let output = '';
    for (let r = 0; r < SCREEN_ROWS; r++) {
      for (let c = 0; c < SCREEN_COLS; c++) {
        output += page.buffer[r][c].char;
      }
      output += '\n';
    }
    return output;
  }

  get fieldCount(): number {
    return this._activeDisplayPage.fields.length;
  }

  get hasFields(): boolean {
    return this.protectSubmode && this._activeDisplayPage.fields.length > 0;
  }
}
