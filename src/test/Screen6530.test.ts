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

  it('detects mode signals (ESC b, ESC c, ESC W, ESC X, and SOH B/C ETX 0x01 0x42/0x43 0x03)', () => {
    expect(translate6530ToAnsi('\x1bb').modeSignal).toBe('block');
    expect(translate6530ToAnsi('\x1bc').modeSignal).toBe('conv');
    expect(translate6530ToAnsi('\x1bW').modeSignal).toBe('block');
    expect(translate6530ToAnsi('\x1bX').modeSignal).toBe('conv');

    // 0x01 0x42 0x03 (SOH B ETX) -> Block Mode
    const sohB = translate6530ToAnsi('\x01B\x03');
    expect(sohB.modeSignal).toBe('block');
    expect(sohB.data).toBe(''); // Consumed framing without leaking 'B' to screen

    // 0x01 0x43 0x03 (SOH C ETX) -> Conversational Mode
    const sohC = translate6530ToAnsi('\x01C\x03');
    expect(sohC.modeSignal).toBe('conv');
    expect(sohC.data).toBe(''); // Consumed framing without leaking 'C' to screen
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

    // ESC [ c and ESC [ > c -> Device Attributes (intercepted so xterm does not reply VT100)
    const daResult = translate6530ToAnsi('\x1b[c');
    expect(daResult.deviceAttributesRequested).toBe(true);
    expect(daResult.data).toBe(''); // Consumed

    const daSecResult = translate6530ToAnsi('\x1b[>c');
    expect(daSecResult.deviceAttributesRequested).toBe(true);
    expect(daSecResult.data).toBe('');

    // Ensure ESC 6 does NOT emit reverse video (\x1b[7m) or highlight text on normal prompt
    const esc6Result = translate6530ToAnsi('\x1b6Prompt>');
    expect(esc6Result.data).not.toContain('\x1b[7m');
  });

  it('correctly maps 6530 display enhancements without emitting reverse video white backgrounds', () => {
    // Underline (bit 0 set: 0x21 '!'): emits \x1b[0;4m
    const underResult = translate6530ToAnsi('\x1b6!UnderlineText');
    expect(underResult.data).toBe('\x1b[0;4mUnderlineText');

    // Normal text via ESC 6 <space> (0x20): emits \x1b[0m
    const normResult = translate6530ToAnsi('\x1b6 $USER1 USNISI 1>');
    expect(normResult.data).toBe('\x1b[0m$USER1 USNISI 1>');

    // Full banner flow: attributes are safely handled without white background
    const fullBannerFlow = '\x1b6!Guten Abend, NISI System: \\OX8\x1b6 \r\n$USER1 USNISI 1> who';
    const flowResult = translate6530ToAnsi(fullBannerFlow);
    expect(flowResult.data).toBe('\x1b[0;4mGuten Abend, NISI System: \\OX8\x1b[0m\r\n$USER1 USNISI 1> who');
    expect(flowResult.data).not.toContain('\x1b[7m');

    // Concealed / Hidden attribute (bit 4 set: 0x50 'P'): emits \x1b[0;8m
    const hiddenResult = translate6530ToAnsi('\x1b6PHidden');
    expect(hiddenResult.data).toBe('\x1b[0;8mHidden');

    // Normal text via ESC 6 @ (0x40): emits \x1b[0m
    const normAtResult = translate6530ToAnsi('\x1b6@Normal');
    expect(normAtResult.data).toBe('\x1b[0mNormal');
  });

  it('normalizes 8-bit C1 controls (CSI 0x9B, OSC 0x9D) to ANSI equivalents', () => {
    // 8-bit CSI (\u009B) followed by 0m -> \x1b[0m
    const csiReset = translate6530ToAnsi('\u009b0m');
    expect(csiReset.data).toBe('\x1b[0m');

    // 8-bit CSI clear screen (\u009B2J)
    const csiClear = translate6530ToAnsi('\u009b2J');
    expect(csiClear.data).toBe('\x1b[2J');
  });

  it('preserves ISO-8859-1 / European characters without corruption or replacement characters', () => {
    const germanText = 'Guten Abend: ä ö ü ß Ä Ö Ü § „German“ – 100€';
    const res = translate6530ToAnsi(germanText);
    expect(res.data).toBe(germanText);
    expect(res.data).not.toContain('\uFFFD');
  });

  it('filters stray non-printable C1 control characters (0x80-0x9F)', () => {
    const textWithC1 = 'Hello\u0080\u0081World';
    const res = translate6530ToAnsi(textWithC1);
    expect(res.data).toBe('HelloWorld');
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

  it('supports 6530 multi-page registers (ESC : write page, ESC ; display page) and page-specific buffers', () => {
    const screen = new Screen6530();
    screen.enterBlockMode();

    // Write to Page 2 while displaying Page 1 (TEDIT/Pathway off-screen build pattern)
    screen.selectWritePage(2);
    screen.setBufferAddress(0, 0);
    for (const ch of 'PAGE2 DATA') screen.writeServerChar(ch);

    // Page 1 buffer should remain untouched
    screen.selectWritePage(1);
    expect(screen.pages[1].buffer[0][0].char).toBe(' ');
    expect(screen.pages[2].buffer[0][0].char).toBe('P');

    // Switch display page to Page 2 and read buffer
    screen.selectDisplayPage(2);
    expect(screen.displayPage).toBe(2);
    const ansi = screen.renderDisplayPageToAnsi();
    expect(ansi).toContain('PAGE2 DATA');
  });

  it('parses Block Mode SOH B ETX LRC with DC1 buffer addressing, GS start field, DC3 cursor, and ESC : / ESC ;', () => {
    // SOH 'B' ETX LRC ('A') + ESC : " (Page 2) + DC1 row 0 col 0 + GS vAttr dAttr + "HELLO" + DC3 row 1 col 2 + ESC ; " (Display Page 2) + ESC b + ETX LRC
    const packet = '\x01B\x03A\x1b:"\x11  \x1d  HELLO\x13"$\x1b;"\x1bb\x03Z';
    const res = translate6530ToAnsi(packet);

    expect(res.modeSignal).toBe('block');
    expect(res.screenCommands).toContainEqual({ type: 'enterBlockMode' });
    expect(res.screenCommands).toContainEqual({ type: 'selectPage', page: 2 });
    expect(res.screenCommands).toContainEqual({ type: 'bufferAddress', row: 0, col: 0 });
    expect(res.screenCommands).toContainEqual({ type: 'startField', videoAttr: 0x20, dataAttr: 0x20 });
    expect(res.screenCommands).toContainEqual({ type: 'cursorOnly', row: 2, col: 4 });
    expect(res.screenCommands).toContainEqual({ type: 'displayPage', page: 2 });
    expect(res.screenCommands).toContainEqual({ type: 'unlockKeyboard' });
  });

  it('generates LRC-framed 6530 Block Mode status, config, revision, cursor, and function key responses', () => {
    const screen = new Screen6530();
    screen.enterBlockMode();
    screen.setCursor(3, 7);

    // Status response in Block Mode: SOH ? @ F B <max-page> X Y ETX <LRC>
    const statusBlock = screen.generateStatusResponse(true);
    expect(statusBlock.startsWith('\x01?@FB7XY\x03')).toBe(true);
    expect(statusBlock.length).toBe(10);

    // Setting max pages via ESC p 4 updates <max-page> in Block Mode status response
    screen.setMaxPages(4);
    expect(screen.generateStatusResponse(true).startsWith('\x01?@FB4XY\x03')).toBe(true);

    // Status response in Conversational Mode: SOH ? @ F B CR
    const statusConv = screen.generateStatusResponse(false);
    expect(statusConv).toBe('\x01?@FB\r');

    // Cursor address response includes page byte ('!' = Page 1 in Conv Mode, selectedPage + 0x20 in Block Mode)
    expect(screen.generateCursorAddressResponse(false, 3, 7)).toBe('\x01_!#\'\r');
    expect(screen.generateCursorAddressResponse(true).startsWith('\x01_!#\'')).toBe(true);

    // Terminal Configuration response uses 3-byte space-padded code/value pairs
    expect(screen.generateConfigResponse(false)).toBe('\x01!A 1B72C 0D 0G 0H15T 0U72h00\r');

    // Block Mode Function Key / Return notification: SOH 'v' <page> <row> <col> ETX <LRC>
    const enterResp = screen.generateWriteReadResponse('\r');
    expect(enterResp.startsWith('\x01v!#\'')).toBe(true);
    expect(enterResp.charCodeAt(5)).toBe(0x03);
  });

  it('reproduces the exact live TEDIT wire log flow and responds to 3-byte ESC - J (1B 2D 4A) without Terminal Error 172', () => {
    const screen = new Screen6530();

    // Exact wire bytes sent by TEDIT on opening file A:
    // 04 01 42 03 00 (EOT + SOH B ETX LRC) + 1B 70 31 04 (ESC p 1 EOT) + 1B 71 04 (ESC q EOT)
    // + 1B 57 (ESC W) + 1B 76 53 30 0D 0F 1B 76 4D 30 0D 1B 76 4D 31 0D
    // + 24 rows of 11 <row> 20 1D 20 40 (DC1 row col=0 + GS vAttr=0x20 dAttr=0x40 unprotected)
    // + 1B 6F 1B 36 25 "1) $USER1.USNISI.A 1/24 (BOF) (EOF) 1:79                  D20." 0D (ESC o status message with embedded ESC 6 %)
    // + 13 20 21 (DC3 row 0 col 1) + 1B 3E (ESC > reset MDT) + 1B 62 04 (ESC b EOT) + 04 05 (EOT ENQ)
    let teditInit =
      '\x04\x01B\x03\x00\x1bp1\x04\x1bq\x04\x1bW\x1bvS0\r\x0f\x1bvM0\r\x1bvM1\r';
    for (let r = 0; r < 24; r++) {
      teditInit += `\x11${String.fromCharCode(0x20 + r)} \x1d @`;
    }
    teditInit +=
      '\x1bo\x1b6%1) $USER1.USNISI.A 1/24 (BOF) (EOF) 1:79                  D20.\r\x13 !\x1b>\x1bb\x04\x04\x05';

    const parsedInit = translate6530ToAnsi(teditInit, false);
    expect(parsedInit.pendingRemainder).toBe('');
    expect(parsedInit.enquiryRequested).toBe(true);

    // Execute screen commands in order
    for (const cmd of parsedInit.screenCommands) {
      switch (cmd.type) {
        case 'enterBlockMode':
          screen.enterBlockMode();
          break;
        case 'setMaxPages':
          screen.setMaxPages(cmd.page!);
          break;
        case 'clear':
          screen.clearSelectedPage();
          break;
        case 'protectSubEnter':
          screen.enterProtectSubmode();
          screen.blockMode = true;
          break;
        case 'bufferAddress':
          screen.setBufferAddress(cmd.row!, cmd.col!);
          break;
        case 'startField':
          screen.startField(cmd.videoAttr!, cmd.dataAttr!, cmd.extAttr);
          break;
        case 'statusMessage':
          screen.statusLine = cmd.char ?? '';
          break;
        case 'cursorOnly':
          screen.setCursorOnly(cmd.row!, cmd.col!);
          break;
        case 'resetMdt':
          screen.resetModifiedDataTags();
          break;
        case 'unlockKeyboard':
          screen.keyboardLocked = false;
          break;
        case 'char':
          screen.writeServerChar(cmd.char!);
          break;
      }
    }

    // Verify 24 unprotected fields exist on rows 0..23, each spanning cols 1..79 (length 79)
    expect(screen.protectSubmode).toBe(true);
    expect(screen.fields.length).toBe(24);
    expect(screen.fields[0].startRow).toBe(0);
    expect(screen.fields[0].startCol).toBe(1);
    expect(screen.fields[0].endRow).toBe(0);
    expect(screen.fields[0].endCol).toBe(79);
    expect(screen.fields[0].length).toBe(79);

    // Verify status message was captured cleanly without leaking into row 23 buffer
    expect(screen.statusLine).toContain('$USER1.USNISI.A 1/24');
    expect(screen.buffer[23][1].char).toBe(' ');

    // Cursor is at row 0, col 1 (' ', '!')
    expect(screen.cursorRow).toBe(0);
    expect(screen.cursorCol).toBe(1);

    // User types "HELLO TEDIT" into row 0 (starting at col 1) and presses Enter
    for (const ch of 'HELLO TEDIT') {
      expect(screen.writeUserChar(ch)).toBe(true);
    }
    const enterNotification = screen.generateWriteReadResponse('\r');
    expect(enterNotification.startsWith('\x01v! ,')).toBe(true);

    // TEDIT responds with 3-byte ESC - J (1B 2D 4A — Read With Address Extended, 0 params)
    const parsedRead = translate6530ToAnsi('\x1b-J', true);
    expect(parsedRead.screenCommands).toEqual([
      { type: 'readWithAddress', row: 0, col: 0, endRow: 23, endCol: 79 },
    ]);

    // Terminal generates Read With Address response containing modified field 0 at DC1 (row 0, col 1 = ' ', '!')
    const readReply = screen.generateReadBufferResponse(true, 0, 0, 23, 79, false);
    expect(readReply).toBe(Screen6530.frameBlockMessage('\x02', '\x11 !HELLO TEDIT'));
  });

  it('supports FS (0x1C) fixed/variable field definitions, DC2/DC4 data compression, and ESC ] / ESC - K Read All Fields', () => {
    const screen = new Screen6530();
    screen.enterBlockMode();
    screen.enterProtectSubmode();
    screen.blockMode = true;

    // FS at (0,0) with index 0x28 (protected, normal video) + DC2 repeat '*' 5 times
    // + FS at (1,0) with index 0x20 (unprotected, normal video) + "INPUT"
    // + ESC - K (Read With Address All Extended)
    const packet = '\x1c  (\x12%*\x1c!  INPUT\x1b-K';
    const res = translate6530ToAnsi(packet, true);

    for (const cmd of res.screenCommands) {
      if (cmd.type === 'defineFieldAttr') {
        screen.defineFieldAttribute(cmd.row!, cmd.col!, cmd.dataAttr!);
      } else if (cmd.type === 'char') {
        screen.writeServerChar(cmd.char!);
      }
    }

    // ESC - J (modified only) should return empty block since MDT is not set on either field
    expect(screen.generateReadBufferResponse(true, 0, 0, 23, 79, false)).toBe(
      Screen6530.frameBlockMessage('\x02', '')
    );

    // ESC - K / ESC ] (readAllFields = true) returns both protected and unprotected fields with DC1 addresses
    const allFieldsReply = screen.generateReadBufferResponse(true, 0, 0, 23, 79, true);
    expect(allFieldsReply).toBe(
      Screen6530.frameBlockMessage('\x02', '\x11 !*****\x11!!INPUT')
    );
  });
});
