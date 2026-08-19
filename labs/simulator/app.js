/* ============================================================
   VGU OS Lab Simulator - Compiler Explorer App Logic
   ============================================================
   Uses the public Godbolt API (https://godbolt.org/api) for
   real compiler output. RISC-V assembly can be executed
   in-browser via the built-in emulator.
   ============================================================ */

(function() {
'use strict';

// ===== DOM References =====
const editor        = document.getElementById('editor');
const lineNumbers   = document.getElementById('line-numbers');
const langSelect    = document.getElementById('lang-select');
const compilerSelect= document.getElementById('compiler-select');
const flagsInput    = document.getElementById('flags-input');
const exampleSelect = document.getElementById('example-select');
const btnCompile    = document.getElementById('btn-compile');
const btnRun        = document.getElementById('btn-run');
const btnClear      = document.getElementById('btn-clear');
const tabAssembly   = document.getElementById('tab-assembly');
const tabOutput     = document.getElementById('tab-output');
const tabRegisters  = document.getElementById('tab-registers');
const tabInfo       = document.getElementById('tab-info');
const statusDot     = document.getElementById('status-dot');
const statusText    = document.getElementById('status-text');
const compileTime   = document.getElementById('compile-time');
const stepCount     = document.getElementById('step-count');
const exitCode      = document.getElementById('exit-code');
const editorLabel   = document.getElementById('editor-label');

const GODBOLT_API = 'https://godbolt.org/api/compiler';

// Line colors for source-to-asm mapping (like Godbolt)
const LINE_COLORS = [
  '#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa',
  '#f472b6', '#fb923c', '#22d3ee', '#c084fc', '#4ade80',
  '#facc15', '#38bdf8', '#e879f9', '#fb7185', '#a3e635',
];

// ===== State =====
let currentLang = 'c';
let currentAsm = null;  // last assembly result from Godbolt
let lastSourceLines = [];

// ===== Populate Compilers =====
function populateCompilers() {
  const lang = langSelect.value;
  currentLang = lang;
  compilerSelect.innerHTML = '';
  const list = COMPILERS[lang] || [];
  list.forEach(function(c) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    compilerSelect.appendChild(opt);
  });

  // Show/hide Run button for RISC-V ASM
  if (lang === 'riscv-asm') {
    btnRun.style.display = '';
    tabRegisters.style.display = '';
    document.querySelector('.tab[data-tab="registers"]').style.display = '';
    editorLabel.textContent = 'RISC-V Assembly';
    flagsInput.value = '(emulator)';
    flagsInput.disabled = true;
  } else {
    btnRun.style.display = 'none';
    tabRegisters.style.display = 'none';
    document.querySelector('.tab[data-tab="registers"]').style.display = 'none';
    editorLabel.textContent = 'Source (' + lang + ')';
    flagsInput.disabled = false;
    if (flagsInput.value === '(emulator)') flagsInput.value = '-O2';
  }
  populateExamples();
}

// ===== Populate Examples =====
function populateExamples() {
  const lang = langSelect.value;
  exampleSelect.innerHTML = '<option value="">-- Select --</option>';
  EXAMPLES.forEach(function(ex) {
    if (ex.lang === lang) {
      const opt = document.createElement('option');
      opt.value = ex.id;
      opt.textContent = ex.title;
      exampleSelect.appendChild(opt);
    }
  });
}

// ===== Line Numbers =====
function updateLineNumbers() {
  const lines = editor.value.split('\n').length;
  let html = '';
  for (let i = 1; i <= lines; i++) {
    html += i + '\n';
  }
  lineNumbers.textContent = html;
}

// ===== Tab Switching =====
document.querySelectorAll('.tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    if (tab.style.display === 'none') return;
    document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    tab.classList.add('active');
    const target = tab.dataset.tab;
    tabAssembly.classList.add('hidden');
    tabOutput.classList.add('hidden');
    tabRegisters.classList.add('hidden');
    tabInfo.classList.add('hidden');
    if (target === 'assembly')  tabAssembly.classList.remove('hidden');
    else if (target === 'output')    tabOutput.classList.remove('hidden');
    else if (target === 'registers') tabRegisters.classList.remove('hidden');
    else if (target === 'info')      tabInfo.classList.remove('hidden');
  });
});

// ===== Status Helpers =====
function setStatus(text, type) {
  statusText.textContent = text;
  statusDot.className = 'status-dot ' + (type || '');
}

function clearOutput() {
  tabAssembly.innerHTML = '';
  tabOutput.innerHTML = '';
  tabRegisters.innerHTML = '';
  // Don't clear Info tab - it should persist
  compileTime.textContent = '';
  stepCount.textContent = '';
  exitCode.textContent = '';
}

function appendOutput(el, text, cls) {
  const line = document.createElement('div');
  line.className = 'out-line ' + (cls || '');
  line.textContent = text;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== COMPILE via Godbolt API =====
async function compileWithGodbolt() {
  const source = editor.value;
  if (!source.trim()) {
    setStatus('Error: empty source', 'error');
    appendOutput(tabAssembly, 'Error: No source code to compile.', 'err');
    return;
  }

  const compilerId = compilerSelect.value;
  const flags = flagsInput.value.trim();

  setStatus('Compiling...', 'running');
  tabAssembly.innerHTML = '<div class="out-line dim">Contacting godbolt.org...</div>';

  const t0 = performance.now();
  try {
    const resp = await fetch(GODBOLT_API + '/' + compilerId + '/compile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        source: source,
        options: {
          userArguments: flags,
          compilerOptions: {
            skipAsm: false,
            executorRequest: false,
          },
          filters: {
            binary: false,
            binaryObject: false,
            commentOnly: true,
            demangle: true,
            directives: true,
            execute: false,
            intel: true,
            labels: true,
            libraryCode: false,
            trim: false,
            debugCalls: false,
          },
        },
      }),
    });

    const data = await resp.json();
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    compileTime.textContent = elapsed + 's';

    if (!resp.ok) {
      setStatus('Compile failed', 'error');
      tabAssembly.innerHTML = '';
      if (data.stderr) {
        data.stderr.forEach(function(err) {
          appendOutput(tabAssembly, err.text, 'err');
        });
      }
      return;
    }

    // Display assembly
    currentAsm = data.asm || [];
    lastSourceLines = source.split('\n');
    displayAssembly(data);

    // Show any compiler warnings/errors
    if (data.stderr && data.stderr.length > 0) {
      tabOutput.innerHTML = '';
      data.stderr.forEach(function(err) {
        const cls = err.tag === 'error' ? 'err' : (err.tag === 'warning' ? 'warn' : 'dim');
        appendOutput(tabOutput, err.text, cls);
      });
    } else {
      tabOutput.innerHTML = '<div class="out-line ok">Compilation successful (0 warnings)</div>';
    }

    setStatus('Compiled OK (' + currentAsm.length + ' asm lines)', 'ok');

  } catch (e) {
    setStatus('Network error', 'error');
    tabAssembly.innerHTML = '';
    appendOutput(tabAssembly, 'Error: ' + e.message, 'err');
    appendOutput(tabAssembly, 'Check your internet connection.', 'dim');
  }
}

// ===== Display Assembly with source mapping =====
function displayAssembly(data) {
  const asmLines = data.asm || [];
  if (asmLines.length === 0) {
    tabAssembly.innerHTML = '<div class="out-line dim">No assembly output.</div>';
    return;
  }

  // Build source line -> color map
  const sourceLineColors = {};
  let colorIdx = 0;
  const usedSourceLines = new Set();

  asmLines.forEach(function(line) {
    if (line.source && line.source.line != null && !usedSourceLines.has(line.source.line)) {
      usedSourceLines.add(line.source.line);
      sourceLineColors[line.source.line] = LINE_COLORS[colorIdx % LINE_COLORS.length];
      colorIdx++;
    }
  });

  let html = '';
  asmLines.forEach(function(line) {
    const text = line.text || '';
    const srcLine = line.source ? line.source.line : null;
    const color = srcLine ? sourceLineColors[srcLine] : null;

    // Parse label vs instruction vs comment
    let labelHtml = '';
    let textHtml = escapeHtml(text);
    let commentHtml = '';

    const commentIdx = text.indexOf('#');
    if (commentIdx >= 0) {
      textHtml = escapeHtml(text.substring(0, commentIdx));
      commentHtml = '<span class="asm-comment">' + escapeHtml(text.substring(commentIdx)) + '</span>';
    }

    // Check if it's a label (ends with :)
    if (/^\s*\S+:\s*$/.test(text)) {
      labelHtml = '<span class="asm-label">' + textHtml + '</span>';
      textHtml = '';
    }

    const addr = line.address != null
      ? '0x' + line.address.toString(16).padStart(4, '0')
      : '';

    html += '<div class="asm-line' + (color ? ' has-source' : '') + '"' +
            (color ? ' style="--line-color:' + color + '"' : '') + '>' +
            '<span class="asm-addr">' + addr + '</span>' +
            '<span class="asm-text">' + (labelHtml || textHtml) + commentHtml + '</span>' +
            '</div>';
  });

  tabAssembly.innerHTML = html;
}

// ===== RUN RISC-V Assembly (in-browser emulator) =====
function runRISCV() {
  const source = editor.value;
  if (!source.trim()) {
    setStatus('Error: empty code', 'error');
    return;
  }

  setStatus('Assembling...', 'running');
  clearOutput();

  let program;
  try {
    program = RISCV.assemble(source);
  } catch (e) {
    setStatus('Assembly error', 'error');
    appendOutput(tabOutput, 'Assembly Error: ' + e.message, 'err');
    return;
  }

  if (program.errors && program.errors.length > 0) {
    setStatus('Assembly error', 'error');
    program.errors.forEach(function(err) {
      appendOutput(tabOutput, 'Line ' + err.line + ': ' + err.msg, 'err');
    });
    return;
  }

  // Show disassembly in assembly tab
  showRISCVDisassembly(program);

  // Execute
  setStatus('Running...', 'running');
  const emu = RISCV.createEmulator();
  try {
    RISCV.runProgram(emu, program);
  } catch (e) {
    setStatus('Runtime error', 'error');
    appendOutput(tabOutput, 'Runtime Error: ' + e.message, 'err');
    showRegisters(emu);
    return;
  }

  // Show output
  if (emu.output && emu.output.length > 0) {
    emu.output.split('\n').forEach(function(line) {
      appendOutput(tabOutput, line, 'stdout');
    });
  } else {
    appendOutput(tabOutput, '(no output)', 'dim');
  }

  showRegisters(emu);
  stepCount.textContent = 'Steps: ' + emu.stepCount;
  exitCode.textContent = 'Exit: ' + (emu.exitCode !== null ? emu.exitCode : '-');

  if (emu.error) {
    setStatus('Runtime error: ' + emu.error, 'error');
    appendOutput(tabOutput, 'Error: ' + emu.error, 'err');
  } else if (emu.halted) {
    setStatus('Finished (exit ' + emu.exitCode + ')', 'ok');
  } else {
    setStatus('Halted (max steps)', 'warn');
  }

  // Switch to output tab
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelector('.tab[data-tab="output"]').classList.add('active');
  tabAssembly.classList.add('hidden');
  tabOutput.classList.remove('hidden');
}

// ===== Show RISC-V Disassembly =====
function showRISCVDisassembly(program) {
  if (!program || !program.instructions) {
    tabAssembly.innerHTML = '<div class="out-line dim">No assembly available.</div>';
    return;
  }
  let html = '';
  program.instructions.forEach(function(inst) {
    const a = (inst.addr !== undefined)
      ? '0x' + inst.addr.toString(16).padStart(4, '0')
      : '----';
    const disasm = RISCV.disassemble(inst);
    html += '<div class="asm-line"><span class="asm-addr">' + a +
            '</span><span class="asm-text">' + escapeHtml(disasm) + '</span></div>';
  });
  tabAssembly.innerHTML = html;
}

// ===== Show Registers =====
function showRegisters(emu) {
  if (!emu) {
    tabRegisters.innerHTML = '<div class="out-line dim">No register data.</div>';
    return;
  }
  let html = '<div class="reg-grid">';
  for (let i = 0; i < 32; i++) {
    const name = RISCV.REG_ABBR[i] || ('x' + i);
    const val = emu.regs[i];
    const hex = '0x' + (val >= 0n ? val.toString(16) : (0xFFFFFFFFFFFFFFFFn + val + 1n).toString(16)).padStart(16, '0');
    const dec = val.toString();
    const changed = emu.changedRegs && emu.changedRegs.has(i);
    html += '<div class="reg-cell' + (changed ? ' changed' : '') + '">' +
            '<span class="reg-name">' + name + '</span>' +
            '<span class="reg-val">' + hex + '</span>' +
            '<span class="reg-dec">' + dec + '</span>' +
            '</div>';
  }
  const pcHex = '0x' + emu.pc.toString(16).padStart(16, '0');
  html += '<div class="reg-cell pc"><span class="reg-name">pc</span>' +
          '<span class="reg-val">' + pcHex + '</span><span class="reg-dec">' +
          emu.pc.toString() + '</span></div>';
  html += '</div>';
  tabRegisters.innerHTML = html;
}

// ===== Show Info =====
function showInfo() {
  tabInfo.innerHTML = `
    <div class="info-content">
      <h3>About This Tool</h3>
      <p>This is a <strong>Compiler Explorer</strong> style tool for the VGU OS course labs.
      It uses the public <a href="https://godbolt.org" style="color:var(--blue-light)">Godbolt API</a>
      to compile C/C++ code to real assembly for multiple ISAs.</p>

      <h3>How to Use</h3>
      <p>1. Select a language (C, C++, or RISC-V ASM)</p>
      <p>2. Choose a compiler target (x86-64, ARM64, RISC-V, MIPS)</p>
      <p>3. Type or load an example, then click <code>Compile</code></p>
      <p>4. The assembly output shows source-to-instruction mapping with colors</p>
      <p>5. For RISC-V ASM, click <code>Run</code> to execute in-browser</p>

      <h3>Supported Compilers</h3>
      <p><code>x86-64</code> gcc/clang, <code>ARM64</code> gcc, <code>RISC-V 64</code> gcc, <code>MIPS64</code> gcc</p>

      <h3>RISC-V In-Browser Emulator</h3>
      <p>When using RISC-V ASM mode, the <code>Run</code> button executes the code
      using a built-in RV64I emulator. It supports:</p>
      <p>- All RV64I base instructions + M extension (mul/div)</p>
      <p>- Load/store (lw, ld, sw, sd, lb, sb, etc.)</p>
      <p>- Branches and jumps (beq, bne, jal, jalr, etc.)</p>
      <p>- Pseudo-instructions (li, mv, la, call, ret, ble, bgt, etc.)</p>
      <p>- ecall syscalls (write=64, exit=93)</p>
      <p>- .data/.text sections, labels, .ascii/.word/.byte directives</p>

      <h3>Compiler Flags</h3>
      <p>Common flags: <code>-O0</code> (no optimization), <code>-O1</code>, <code>-O2</code>,
      <code>-O3</code> (aggressive), <code>-Os</code> (size), <code>-Wall</code> (warnings)</p>
    </div>`;
}

// ===== Event Handlers =====

langSelect.addEventListener('change', function() {
  populateCompilers();
  clearOutput();
  setStatus('Ready', '');
  updateLineNumbers();
});

compilerSelect.addEventListener('change', function() {
  clearOutput();
  setStatus('Ready', '');
});

exampleSelect.addEventListener('change', function() {
  const id = exampleSelect.value;
  if (!id) return;
  const ex = EXAMPLES.find(function(e) { return e.id === id; });
  if (ex) {
    editor.value = ex.code;
    updateLineNumbers();
    clearOutput();
    setStatus('Loaded: ' + ex.title, 'ok');
  }
});

btnCompile.addEventListener('click', function() {
  clearOutput();
  if (currentLang === 'riscv-asm') {
    // For RISC-V ASM, "Compile" = assemble + show disassembly
    const source = editor.value;
    if (!source.trim()) {
      setStatus('Error: empty code', 'error');
      return;
    }
    try {
      const program = RISCV.assemble(source);
      showRISCVDisassembly(program);
      setStatus('Assembled (' + program.instructions.length + ' instructions)', 'ok');
    } catch (e) {
      setStatus('Assembly error', 'error');
      appendOutput(tabAssembly, 'Error: ' + e.message, 'err');
    }
  } else {
    compileWithGodbolt();
  }
});

btnRun.addEventListener('click', function() {
  runRISCV();
});

btnClear.addEventListener('click', function() {
  editor.value = '';
  updateLineNumbers();
  clearOutput();
  setStatus('Ready', '');
});

// Auto-compile on source change (debounced)
let compileTimer = null;
editor.addEventListener('input', function() {
  updateLineNumbers();
  if (currentLang === 'riscv-asm') return; // no auto for asm
  clearTimeout(compileTimer);
  compileTimer = setTimeout(function() {
    btnCompile.click();
  }, 800);
});

// Keyboard shortcut: Ctrl+Enter to compile
editor.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    btnCompile.click();
  }
  // Tab inserts spaces
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
    editor.selectionStart = editor.selectionEnd = start + 4;
  }
});

// Sync scroll between line numbers and editor
editor.addEventListener('scroll', function() {
  lineNumbers.scrollTop = editor.scrollTop;
});

// ===== Init =====
populateCompilers();
updateLineNumbers();
showInfo();
setStatus('Ready', '');

// Load first C example
const firstEx = EXAMPLES.find(function(e) { return e.lang === 'c'; });
if (firstEx) {
  editor.value = firstEx.code;
  updateLineNumbers();
}

})();
