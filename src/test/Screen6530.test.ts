import { describe, it, expect, beforeEach } from 'vitest';
import { Screen6530 } from '../lib/Screen6530';
import { translate6530ToAnsi } from '../components/Terminal';

describe('Screen6530 Engine', () => {
  let screen: Screen6530;

  beforeEach(() => {
    screen = new Screen6530();
  });

  it('initializes with default empty 80x24 buffer in conversational mode', () => {
    expect(screen.cursorRow).toBe(0);
    expect(screen.cursorCol).toBe(0);
    expect(screen.protectSubmode).toBe(false);
    expect(screen.hasFields).toBe(false);
  });

  it('enters protect submode and rejects input in protected areas', () => {
    screen.enterProtectSubmode();
    expect(screen.protectSubmode).toBe(true);

    // Write protected prompt from server
    const prompt = 'USERNAME: ';
    for (const ch of prompt) {
      screen.writeServerChar(ch);
    }

    // User should NOT be able to type into protected prompt
    screen.setCursor(0, 0);
    const typedInProtected = screen.writeUserChar('X');
    expect(typedInProtected).toBe(false);
  });

  it('creates unprotected fields and accepts user typing', () => {
    screen.enterProtectSubmode();

    // Server writes label
    for (const ch of 'USER: ') screen.writeServerChar(ch);

    // Server opens unprotected field
    screen.startUnprotected();
    const userFieldStartCol = screen.cursorCol;
    expect(userFieldStartCol).toBe(6);
    expect(screen.fields[0].startCol).toBe(userFieldStartCol);

    // User types into unprotected field
    for (const ch of 'SUPER') {
      const allowed = screen.writeUserChar(ch);
      expect(allowed).toBe(true);
    }

    expect(screen.hasFields).toBe(true);
    expect(screen.collectFieldData()).toBe('SUPER');
  });

  it('supports backspace within unprotected field', () => {
    screen.enterProtectSubmode();
    screen.startUnprotected();

    screen.writeUserChar('A');
    screen.writeUserChar('B');
    expect(screen.collectFieldData()).toBe('AB');

    const deleted = screen.deleteCharAtCursor();
    expect(deleted).toBe(true);
    expect(screen.collectFieldData()).toBe('A');
  });

  it('supports Tab and Shift-Tab navigation across multiple fields', () => {
    screen.enterProtectSubmode();

    // Field 1 at (1, 10)
    screen.setCursor(1, 0);
    for (const ch of 'NAME:     ') screen.writeServerChar(ch);
    screen.startUnprotected();
    for (const ch of '          ') screen.writeServerChar(ch);
    screen.startProtected();

    // Field 2 at (2, 10)
    screen.setCursor(2, 0);
    for (const ch of 'DEPT:     ') screen.writeServerChar(ch);
    screen.startUnprotected();
    for (const ch of '          ') screen.writeServerChar(ch);
    screen.startProtected();

    expect(screen.fields.length).toBe(2);

    // Tab moves from field 0 to field 1
    screen.setCursor(1, 10);
    const tab1 = screen.tabToNextField();
    expect(tab1).toEqual({ row: 2, col: 10 });

    // Tab wraps from field 1 back to field 0
    const tab2 = screen.tabToNextField();
    expect(tab2).toEqual({ row: 1, col: 10 });

    // Shift-Tab moves backwards to field 1
    const shiftTab = screen.tabToPrevField();
    expect(shiftTab).toEqual({ row: 2, col: 10 });
  });

  it('supports local arrow key movement and home cursor in block mode', () => {
    screen.setCursor(5, 10);

    expect(screen.moveCursorLeft()).toEqual({ row: 5, col: 9 });
    expect(screen.moveCursorRight()).toEqual({ row: 5, col: 10 });
    expect(screen.moveCursorUp()).toEqual({ row: 4, col: 10 });
    expect(screen.moveCursorDown()).toEqual({ row: 5, col: 10 });

    screen.homeCursor();
    expect(screen.cursorRow).toBe(0);
    expect(screen.cursorCol).toBe(0);
  });

  it('generates standard WRITEREAD response with DC2 and space-offset cursor for Enter', () => {
    screen.enterProtectSubmode();
    screen.startUnprotected();
    for (const ch of 'TEST') screen.writeUserChar(ch);

    screen.setCursor(2, 5); // row 2, col 5
    const response = screen.generateWriteReadResponse('\r');

    // DC2 (0x12) + cursorRow (2 + 0x20 = '"') + cursorCol (5 + 0x20 = '%') + data + CR
    expect(response.startsWith('\x12"%TEST')).toBe(true);
    expect(response.endsWith('\r')).toBe(true);
  });

  it('generates WRITEREAD response with SOH + key code for Function Keys', () => {
    screen.enterProtectSubmode();
    screen.startUnprotected();
    for (const ch of 'DATA') screen.writeUserChar(ch);

    screen.setCursor(0, 0);
    // F1 sequence trigger '\x1bp' -> should prepend '\x01p'
    const response = screen.generateWriteReadResponse('\x1bp');

    expect(response.startsWith('\x01p  DATA')).toBe(true);
    expect(response.endsWith('\r')).toBe(true);
  });

  it('correctly handles field closure when startProtected immediately follows startUnprotected', () => {
    screen.enterProtectSubmode();
    screen.setCursor(3, 10);
    screen.startUnprotected();
    // Immediate protect switch without cursor movement
    screen.startProtected();

    expect(screen.fields.length).toBe(1);
    expect(screen.fields[0].startCol).toBe(10);
    expect(screen.fields[0].endCol).toBe(10);
    expect(screen.fields[0].length).toBe(1);
  });
});

describe('translate6530ToAnsi Protocol Parser', () => {
  it('translates 6530 absolute cursor addressing ESC = row col to ANSI', () => {
    // ESC = space space -> row 0, col 0 -> ANSI ESC [ 1 ; 1 H
    const input = '\x1b=  Hello';
    const result = translate6530ToAnsi(input);

    expect(result.data).toBe('\x1b[1;1HHello');
    expect(result.screenCommands).toContainEqual({ type: 'cursor', row: 0, col: 0 });
  });

  it('detects mode signals (ESC b, ESC c, ESC W, ESC X)', () => {
    expect(translate6530ToAnsi('\x1bb').modeSignal).toBe('block');
    expect(translate6530ToAnsi('\x1bc').modeSignal).toBe('conv');
    expect(translate6530ToAnsi('\x1bW').modeSignal).toBe('block');
    expect(translate6530ToAnsi('\x1bX').modeSignal).toBe('conv');
  });

  it('detects DC1 write-read activation and terminal interrogation queries', () => {
    const dc1Result = translate6530ToAnsi('\x11Form Data\x13');
    expect(dc1Result.writeReadActive).toBe(true);

    // ESC a and ESC Z -> Read Cursor Address / Identify
    const cursorQueryResult = translate6530ToAnsi('\x1ba');
    expect(cursorQueryResult.readCursorRequested).toBe(true);

    const cursorZResult = translate6530ToAnsi('\x1bZ');
    expect(cursorZResult.readCursorRequested).toBe(true);

    // ESC ^ -> Read Primary Terminal Status
    const statusQueryResult = translate6530ToAnsi('\x1b^');
    expect(statusQueryResult.readStatusRequested).toBe(true);

    // ESC ] -> Read Secondary Terminal Status (when not followed by digit)
    const secStatusQueryResult = translate6530ToAnsi('\x1b]');
    expect(secStatusQueryResult.readSecondaryStatusRequested).toBe(true);

    // ESC / -> Read Model Number
    const modelQueryResult = translate6530ToAnsi('\x1b/');
    expect(modelQueryResult.readModelRequested).toBe(true);

    // ESC ? -> Read Terminal ID
    const idQueryResult = translate6530ToAnsi('\x1b?');
    expect(idQueryResult.readIdRequested).toBe(true);

    // ENQ (\x05) -> Host Enquiry
    const enqResult = translate6530ToAnsi('\x05');
    expect(enqResult.enquiryRequested).toBe(true);

    // ESC [ c -> Device Attributes (intercepted so xterm does not reply VT100)
    const daResult = translate6530ToAnsi('\x1b[c');
    expect(daResult.deviceAttributesRequested).toBe(true);
    expect(daResult.data).toBe(''); // Consumed

    // Ensure ESC 6 does NOT emit reverse video (\x1b[7m) or highlight text
    const esc6Result = translate6530ToAnsi('\x1b6Prompt>');
    expect(esc6Result.data).not.toContain('\x1b[7m');
  });

  it('handles split escape sequence chunks via pendingRemainder', () => {
    // Chunk 1 ends prematurely with ESC = and row byte, but missing col byte
    const chunk1 = 'Hello\x1b= ';
    const res1 = translate6530ToAnsi(chunk1);

    expect(res1.data).toBe('Hello');
    expect(res1.pendingRemainder).toBe('\x1b= ');

    // Chunk 2 arrives with the col byte and subsequent text
    const chunk2 = res1.pendingRemainder + ' World';
    const res2 = translate6530ToAnsi(chunk2);

    expect(res2.data).toBe('\x1b[1;1HWorld');
    expect(res2.pendingRemainder).toBe('');
  });

  it('passes through ANSI OSC sequences (window title) and handles split OSC packets', () => {
    const titleSeq = '\x1b]0;TACL - Super.User\x07';
    const result = translate6530ToAnsi(titleSeq);
    expect(result.data).toBe(titleSeq);
    expect(result.pendingRemainder).toBe('');

    // Split OSC across chunks
    const chunk1 = 'Prompt> \x1b]0;Window';
    const res1 = translate6530ToAnsi(chunk1);
    expect(res1.data).toBe('Prompt> ');
    expect(res1.pendingRemainder).toBe('\x1b]0;Window');

    const chunk2 = res1.pendingRemainder + ' Title\x07Hello';
    const res2 = translate6530ToAnsi(chunk2);
    expect(res2.data).toBe('\x1b]0;Window Title\x07Hello');
    expect(res2.pendingRemainder).toBe('');
  });

  it('filters out null padding bytes without breaking translation', () => {
    const inputWithNuls = 'A\x00B\x00\x1b=  C\x00';
    const res = translate6530ToAnsi(inputWithNuls);
    expect(res.data).toBe('AB\x1b[1;1HC');
  });
});
