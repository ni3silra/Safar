// ─── HP 6530 Screen Buffer Engine ───
// Implements the 80×24 screen buffer with per-cell field tracking required
// for full VT6530 block-mode protocol compliance.
//
// This engine tracks:
// - Character content for each screen cell
// - Protected vs unprotected field boundaries
// - Field map (ordered list of unprotected fields)
// - Cursor position
// - Protect submode state
//
// Used by Terminal.tsx to support Pathway screens, DBU, and other
// HP NonStop form-based applications that use WRITEREAD protocol.

// ─── Constants ───
export const SCREEN_ROWS = 24;
export const SCREEN_COLS = 80;

// Field separator used between fields in WRITEREAD response
const FIELD_SEPARATOR = '\x1c'; // FS (0x1C) — standard 6530 field separator

// ─── Types ───
export interface ScreenCell {
  char: string;        // The character at this position
  protected: boolean;  // true = protected (user can't type here)
  fieldId: number;     // -1 = no field, 0+ = unprotected field index
  attribute: number;   // 6530 display attribute bitmask
  modified: boolean;   // true if user has modified this cell
}

export interface Field {
  id: number;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  length: number;
}

// ─── Screen6530 Class ───
export class Screen6530 {
  buffer: ScreenCell[][];
  fields: Field[];
  cursorRow: number;
  cursorCol: number;
  protectSubmode: boolean;   // true after ESC W
  currentProtected: boolean; // current writing mode (protected or unprotected)
  currentFieldId: number;    // current field being defined (-1 if protected)
  private _nextFieldId: number;

  constructor() {
    this.buffer = [];
    this.fields = [];
    this.cursorRow = 0;
    this.cursorCol = 0;
    this.protectSubmode = false;
    this.currentProtected = false;
    this.currentFieldId = -1;
    this._nextFieldId = 0;
    this._initBuffer();
  }

  // ─── Buffer Initialization ───
  private _initBuffer(): void {
    this.buffer = [];
    for (let r = 0; r < SCREEN_ROWS; r++) {
      const row: ScreenCell[] = [];
      for (let c = 0; c < SCREEN_COLS; c++) {
        row.push({
          char: ' ',
          protected: false,
          fieldId: -1,
          attribute: 0,
          modified: false,
        });
      }
      this.buffer.push(row);
    }
  }

  // ─── Reset ───
  // Full reset — clear everything and return to initial state
  reset(): void {
    this._initBuffer();
    this.fields = [];
    this.cursorRow = 0;
    this.cursorCol = 0;
    this.protectSubmode = false;
    this.currentProtected = false;
    this.currentFieldId = -1;
    this._nextFieldId = 0;
  }

  // ─── Enter Protect Submode (ESC W) ───
  // Per 6530 spec: clears screen, homes cursor, enters protect mode.
  // After this, text written by the server is PROTECTED by default.
  // ESC ( switches to unprotected (defines a field).
  // ESC ) switches back to protected.
  enterProtectSubmode(): void {
    this.reset();
    this.protectSubmode = true;
    this.currentProtected = true; // Default to protected after ESC W
    this.currentFieldId = -1;
  }

  // ─── Exit Protect Submode (ESC X) ───
  exitProtectSubmode(): void {
    this.protectSubmode = false;
    this.currentProtected = false;
    this.currentFieldId = -1;
  }

  // ─── Start Protected Field (ESC )) ───
  // Mark subsequent server-written text as protected
  startProtected(): void {
    // Close any open unprotected field
    this._closeCurrentField();
    this.currentProtected = true;
    this.currentFieldId = -1;
  }

  // ─── Start Unprotected Field (ESC () ───
  // Mark subsequent area as an unprotected field the user can type in
  startUnprotected(): void {
    this.currentProtected = false;
    // Start a new field at the current cursor position
    const fieldId = this._nextFieldId++;
    this.currentFieldId = fieldId;
    this.fields.push({
      id: fieldId,
      startRow: this.cursorRow,
      startCol: this.cursorCol,
      endRow: this.cursorRow,
      endCol: this.cursorCol,
      length: 0,
    });
  }

  // ─── Close Current Unprotected Field ───
  private _closeCurrentField(): void {
    if (this.currentFieldId >= 0) {
      const field = this.fields.find(f => f.id === this.currentFieldId);
      if (field) {
        // End position is one BEFORE the current cursor (last cell of the field)
        if (this.cursorCol > 0) {
          field.endRow = this.cursorRow;
          field.endCol = this.cursorCol - 1;
        } else if (this.cursorRow > 0) {
          field.endRow = this.cursorRow - 1;
          field.endCol = SCREEN_COLS - 1;
        }
        field.length = this._calculateFieldLength(field);
      }
    }
  }

  // ─── Calculate Field Length ───
  private _calculateFieldLength(field: Field): number {
    if (field.startRow === field.endRow) {
      return field.endCol - field.startCol + 1;
    }
    // Multi-row field
    let len = SCREEN_COLS - field.startCol; // first partial row
    len += (field.endRow - field.startRow - 1) * SCREEN_COLS; // full middle rows
    len += field.endCol + 1; // last partial row
    return Math.max(0, len);
  }

  // ─── Set Cursor Position ───
  // Supports both absolute (row >= 0, col >= 0) and relative movement:
  //   row=-1 = up, row=-2 = down, col=-1 = right, col=-2 = left
  //   -99 = no change on that axis
  setCursor(row: number, col: number): void {
    if (row === -99 && col === -99) return; // no-op

    // Handle relative movement
    if (row < 0 || col < 0) {
      if (row === -1) this.cursorRow = Math.max(0, this.cursorRow - 1);           // up
      else if (row === -2) this.cursorRow = Math.min(SCREEN_ROWS - 1, this.cursorRow + 1); // down
      
      if (col === -1) this.cursorCol = Math.min(SCREEN_COLS - 1, this.cursorCol + 1);      // right
      else if (col === -2) this.cursorCol = Math.max(0, this.cursorCol - 1);     // left
      return;
    }

    // Absolute positioning
    this.cursorRow = Math.max(0, Math.min(SCREEN_ROWS - 1, row));
    this.cursorCol = Math.max(0, Math.min(SCREEN_COLS - 1, col));
  }

  // ─── Write Character (Server Writing to Screen) ───
  // Used when the server sends text to populate the form.
  // Marks cells as protected or unprotected based on current mode.
  writeServerChar(ch: string): void {
    if (this.cursorRow >= SCREEN_ROWS) return;

    // Handle CR (0x0D) — return cursor to column 0
    if (ch === '\r') {
      this.cursorCol = 0;
      return;
    }
    // Handle LF (0x0A) — move cursor down one row
    if (ch === '\n') {
      this.cursorRow = Math.min(SCREEN_ROWS - 1, this.cursorRow + 1);
      return;
    }
    // Handle BS (0x08) — move cursor left
    if (ch === '\b') {
      if (this.cursorCol > 0) this.cursorCol--;
      return;
    }
    // Handle TAB (0x09) — advance to next tab stop (every 8 columns)
    if (ch === '\t') {
      this.cursorCol = Math.min(SCREEN_COLS - 1, (Math.floor(this.cursorCol / 8) + 1) * 8);
      return;
    }

    const cell = this.buffer[this.cursorRow][this.cursorCol];
    cell.char = ch;
    cell.protected = this.currentProtected;
    cell.fieldId = this.currentFieldId;
    cell.modified = false;

    // Update field boundaries if in an unprotected field
    if (this.currentFieldId >= 0) {
      const field = this.fields.find(f => f.id === this.currentFieldId);
      if (field) {
        field.endRow = this.cursorRow;
        field.endCol = this.cursorCol;
        field.length = this._calculateFieldLength(field);
      }
    }

    // Advance cursor
    this._advanceCursor();
  }

  // ─── Write Character (User Input) ───
  // Used when the user types in an unprotected field.
  // Returns false if the cursor is in a protected area (reject the keystroke).
  writeUserChar(ch: string): boolean {
    if (this.cursorRow >= SCREEN_ROWS) return false;

    const cell = this.buffer[this.cursorRow][this.cursorCol];

    // Reject if in protected area
    if (cell.protected) return false;

    // Check if we're in a valid field
    if (cell.fieldId < 0 && this.protectSubmode) return false;

    cell.char = ch;
    cell.modified = true;

    // Advance cursor, but stop at field boundary
    const fieldId = cell.fieldId;
    this._advanceCursor();

    // If the new position is in a different field or protected, don't overflow
    if (this.protectSubmode) {
      const newCell = this.buffer[this.cursorRow][this.cursorCol];
      if (newCell.protected || newCell.fieldId !== fieldId) {
        // Cursor moved out of field — stay at last position of the field
        // (allow it — the cursor will appear on the next protected char,
        // but the next char typed will be rejected, which is correct 6530 behavior)
      }
    }

    return true;
  }

  // ─── Delete Character at Cursor (Backspace) ───
  // Returns false if not allowed (protected area)
  deleteCharAtCursor(): boolean {
    // Move cursor back one position
    if (this.cursorCol > 0) {
      this.cursorCol--;
    } else if (this.cursorRow > 0) {
      this.cursorRow--;
      this.cursorCol = SCREEN_COLS - 1;
    } else {
      return false; // At home position
    }

    const cell = this.buffer[this.cursorRow][this.cursorCol];

    // Don't delete from protected area
    if (cell.protected) {
      // Restore cursor position
      this._advanceCursor();
      return false;
    }

    cell.char = ' ';
    cell.modified = true;
    return true;
  }

  // ─── Advance Cursor ───
  private _advanceCursor(): void {
    this.cursorCol++;
    if (this.cursorCol >= SCREEN_COLS) {
      this.cursorCol = 0;
      this.cursorRow++;
      if (this.cursorRow >= SCREEN_ROWS) {
        this.cursorRow = SCREEN_ROWS - 1; // Stay at last row
      }
    }
  }

  // ─── Tab to Next Unprotected Field ───
  // Returns the new cursor position, or null if no fields available
  tabToNextField(): { row: number; col: number } | null {
    if (this.fields.length === 0) return null;

    // Find the current field the cursor is in (or nearest one after)
    let currentIdx = -1;
    for (let i = 0; i < this.fields.length; i++) {
      const f = this.fields[i];
      if (this._posInField(this.cursorRow, this.cursorCol, f)) {
        currentIdx = i;
        break;
      }
    }

    // Move to the next field (wrap around)
    let nextIdx: number;
    if (currentIdx >= 0) {
      nextIdx = (currentIdx + 1) % this.fields.length;
    } else {
      // Not in any field — find the first field after the cursor
      nextIdx = 0;
      for (let i = 0; i < this.fields.length; i++) {
        const f = this.fields[i];
        if (f.startRow > this.cursorRow || 
            (f.startRow === this.cursorRow && f.startCol > this.cursorCol)) {
          nextIdx = i;
          break;
        }
      }
    }

    const nextField = this.fields[nextIdx];
    this.cursorRow = nextField.startRow;
    this.cursorCol = nextField.startCol;

    return { row: this.cursorRow, col: this.cursorCol };
  }

  // ─── Shift-Tab to Previous Unprotected Field ───
  tabToPrevField(): { row: number; col: number } | null {
    if (this.fields.length === 0) return null;

    let currentIdx = -1;
    for (let i = 0; i < this.fields.length; i++) {
      if (this._posInField(this.cursorRow, this.cursorCol, this.fields[i])) {
        currentIdx = i;
        break;
      }
    }

    let prevIdx: number;
    if (currentIdx > 0) {
      prevIdx = currentIdx - 1;
    } else {
      prevIdx = this.fields.length - 1; // Wrap to last field
    }

    const prevField = this.fields[prevIdx];
    this.cursorRow = prevField.startRow;
    this.cursorCol = prevField.startCol;

    return { row: this.cursorRow, col: this.cursorCol };
  }

  // ─── Check if position is inside a field ───
  private _posInField(row: number, col: number, field: Field): boolean {
    const pos = row * SCREEN_COLS + col;
    const start = field.startRow * SCREEN_COLS + field.startCol;
    const end = field.endRow * SCREEN_COLS + field.endCol;
    return pos >= start && pos <= end;
  }

  // ─── Collect All Unprotected Field Data ───
  // Returns the content of all unprotected fields, separated by FS (0x1C)
  collectFieldData(): string {
    if (this.fields.length === 0) return '';

    const fieldContents: string[] = [];

    for (const field of this.fields) {
      let content = '';
      let row = field.startRow;
      let col = field.startCol;

      while (row < SCREEN_ROWS) {
        const cell = this.buffer[row][col];
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

      // Trim trailing spaces from each field (6530 convention)
      fieldContents.push(content.replace(/\s+$/, ''));
    }

    return fieldContents.join(FIELD_SEPARATOR);
  }

  // ─── Collect ONLY Modified Field Data ───
  // More efficient — only sends fields that were changed by the user
  collectModifiedFieldData(): string {
    if (this.fields.length === 0) return '';

    const parts: string[] = [];

    for (const field of this.fields) {
      let hasModified = false;
      let content = '';
      let row = field.startRow;
      let col = field.startCol;

      while (row < SCREEN_ROWS) {
        const cell = this.buffer[row][col];
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

  // ─── Generate WRITEREAD Response ───
  // Per 6530 spec, the response format is:
  //   DC2 (acknowledge) + cursor_row + cursor_col + field_data + CR
  // Cursor position bytes are space-offset (pos + 0x20)
  // Field data is separated by FS (0x1C) between fields
  generateWriteReadResponse(_triggerKey?: string): string {
    const cursorRow = String.fromCharCode(this.cursorRow + 0x20);
    const cursorCol = String.fromCharCode(this.cursorCol + 0x20);
    const fieldData = this.collectFieldData();
    
    // DC2 (0x12) = Device Control 2 — terminal readiness acknowledgment
    // The response includes: DC2 + cursor_pos + field_data + CR
    const response = '\x12' + cursorRow + cursorCol + fieldData + '\r';
    
    // Clear modified flags after sending
    this._clearModifiedFlags();
    
    return response;
  }

  // ─── Clear Modified Flags ───
  // After a WRITEREAD response, clear all modified flags
  // so the next response only sends newly-changed data
  private _clearModifiedFlags(): void {
    for (let r = 0; r < SCREEN_ROWS; r++) {
      for (let c = 0; c < SCREEN_COLS; c++) {
        this.buffer[r][c].modified = false;
      }
    }
  }

  // ─── Clear Unprotected Fields Only ───
  // Clears all unprotected cells to spaces (keeps protected text intact)
  clearUnprotected(): void {
    for (let r = 0; r < SCREEN_ROWS; r++) {
      for (let c = 0; c < SCREEN_COLS; c++) {
        const cell = this.buffer[r][c];
        if (!cell.protected && cell.fieldId >= 0) {
          cell.char = ' ';
          cell.modified = false;
        }
      }
    }
  }

  // ─── Get Field at Cursor ───
  // Returns the field the cursor is currently in, or null
  getFieldAtCursor(): Field | null {
    for (const field of this.fields) {
      if (this._posInField(this.cursorRow, this.cursorCol, field)) {
        return field;
      }
    }
    return null;
  }

  // ─── Is Cursor in Protected Area? ───
  isCursorProtected(): boolean {
    if (this.cursorRow >= SCREEN_ROWS || this.cursorCol >= SCREEN_COLS) return true;
    return this.buffer[this.cursorRow][this.cursorCol].protected;
  }

  // ─── Get Screen Content as String (Debug) ───
  toString(): string {
    let output = '';
    for (let r = 0; r < SCREEN_ROWS; r++) {
      for (let c = 0; c < SCREEN_COLS; c++) {
        output += this.buffer[r][c].char;
      }
      output += '\n';
    }
    return output;
  }

  // ─── Get Field Count ───
  get fieldCount(): number {
    return this.fields.length;
  }

  // ─── Has Protect Submode Fields? ───
  get hasFields(): boolean {
    return this.protectSubmode && this.fields.length > 0;
  }
}
