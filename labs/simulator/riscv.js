/* ============================================================
   VGU OS Lab Simulator - RISC-V RV64I Assembler + Emulator
   ============================================================
   A pure-JavaScript RISC-V assembler and emulator that runs
   entirely in the browser. No backend needed.

   Supports:
   - RV64I base instructions (add, sub, mul, div, etc.)
   - Load/store (lw, ld, sw, sd, lb, sb, lbu)
   - Branches (beq, bne, blt, bge, bltu, bgeu)
   - Jumps (jal, jalr, j, call, ret, jr)
   - Pseudo-instructions (li, mv, la, nop, neg, not, bnez, beqz)
   - CSR access (csrr, csrw)
   - ecall (syscall: write, exit, etc.)
   - .data / .text sections, .globl, labels
   ============================================================ */

(function(global) {
'use strict';

// ============================================================
// REGISTER NAMES
// ============================================================
const REG_NAMES = {
  x0:0, zero:0, ra:1, sp:2, gp:3, tp:4, t0:5, t1:6, t2:7,
  s0:8, fp:8, s1:9, a0:10, a1:11, a2:12, a3:13, a4:14, a5:15,
  a6:16, a7:17, s2:18, s3:19, s4:20, s5:21, s6:22, s7:23,
  s8:24, s9:25, s10:26, s11:27, t3:28, t4:29, t5:30, t6:31
};
const REG_ABBR = ['zero','ra','sp','gp','tp','t0','t1','t2','s0','s1',
  'a0','a1','a2','a3','a4','a5','a6','a7','s2','s3','s4','s5','s6','s7',
  's8','s9','s10','s11','t3','t4','t5','t6'];

// ============================================================
// ASSEMBLER
// ============================================================

function assemble(source) {
  const lines = source.split('\n');
  const instructions = [];
  const labels = {};
  const dataLabels = {};
  let section = 'text';
  let addr = 0;
  let dataAddr = 0x10000; // data section starts at 64KB
  const dataBytes = [];

  // First pass: collect labels and instructions
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/\/\/.*$/, '').replace(/#.*$/, '').trim();
    if (!line) continue;

    // Section directives
    if (/^\.text/i.test(line)) { section = 'text'; continue; }
    if (/^\.data/i.test(line)) { section = 'data'; continue; }
    if (/^\.bss/i.test(line)) { section = 'bss'; continue; }
    if (/^\.globl/i.test(line) || /^\.global/i.test(line)) continue;
    if (/^\.align/i.test(line)) continue;
    if (/^\.section/i.test(line)) continue;

    // Labels
    const labelMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (labelMatch) {
      const name = labelMatch[1];
      const rest = labelMatch[2].trim();
      if (section === 'data') {
        dataLabels[name] = dataAddr;
      } else {
        labels[name] = addr;
      }
      if (!rest) continue;
      line = rest;
    }

    if (section === 'data') {
      // .word, .byte, .ascii, .string, .space
      const wordMatch = line.match(/^\.word\s+(.+)$/i);
      const byteMatch = line.match(/^\.byte\s+(.+)$/i);
      const asciiMatch = line.match(/^\.ascii\s+"(.*)"$/i);
      const stringMatch = line.match(/^\.string\s+"(.*)"$/i);
      const spaceMatch = line.match(/^\.space\s+(\d+)$/i);
      const halfMatch = line.match(/^\.half\s+(.+)$/i);
      const dwordMatch = line.match(/^\.quad\s+(.+)$/i);

      if (wordMatch) {
        wordMatch[1].split(',').forEach(v => {
          const n = parseInt(v.trim(), 0);
          dataBytes.push({addr: dataAddr, val: n, size: 4});
          dataAddr += 4;
        });
      } else if (dwordMatch) {
        dwordMatch[1].split(',').forEach(v => {
          const n = parseInt(v.trim(), 0);
          dataBytes.push({addr: dataAddr, val: n, size: 8});
          dataAddr += 8;
        });
      } else if (halfMatch) {
        halfMatch[1].split(',').forEach(v => {
          const n = parseInt(v.trim(), 0);
          dataBytes.push({addr: dataAddr, val: n, size: 2});
          dataAddr += 2;
        });
      } else if (byteMatch) {
        byteMatch[1].split(',').forEach(v => {
          const n = parseInt(v.trim(), 0);
          dataBytes.push({addr: dataAddr, val: n, size: 1});
          dataAddr += 1;
        });
      } else if (asciiMatch) {
        const str = asciiMatch[1];
        for (let c of str) {
          dataBytes.push({addr: dataAddr, val: c.charCodeAt(0), size: 1});
          dataAddr += 1;
        }
      } else if (stringMatch) {
        const str = stringMatch[1] + '\n';
        for (let c of str) {
          dataBytes.push({addr: dataAddr, val: c.charCodeAt(0), size: 1});
          dataAddr += 1;
        }
      } else if (spaceMatch) {
        const n = parseInt(spaceMatch[1]);
        for (let j = 0; j < n; j++) {
          dataBytes.push({addr: dataAddr, val: 0, size: 1});
          dataAddr += 1;
        }
      }
      continue;
    }

    // Text section: parse instruction
    // Handle directives like .word in text
    if (/^\.word/i.test(line)) {
      const vals = line.replace(/^\.word\s+/i, '').split(',');
      vals.forEach(v => {
        instructions.push({ addr: addr, raw: '__word__', val: parseInt(v.trim(), 0) });
        addr += 4;
      });
      continue;
    }

    instructions.push({ addr: addr, raw: line, lineNum: i + 1 });
    addr += 4;
  }

  // Second pass: resolve labels and encode
  const allLabels = Object.assign({}, labels, dataLabels);
  const encoded = instructions.map(inst => {
    if (inst.raw === '__word__') {
      return { addr: inst.addr, type: 'word', val: inst.val, lineNum: inst.lineNum };
    }
    return parseInstruction(inst.raw, inst.addr, allLabels, inst.lineNum);
  });

  return { instructions: encoded, labels: allLabels, dataBytes, dataStart: 0x10000, dataEnd: dataAddr };
}

function parseInstruction(raw, addr, labels, lineNum) {
  // Split mnemonic and operands
  const parts = raw.match(/^(\S+)\s*(.*)$/);
  if (!parts) return { addr, type: 'error', error: 'parse error', lineNum };

  const mnem = parts[1].toLowerCase();
  const opsStr = parts[2].trim();
  const ops = opsStr ? opsStr.split(',').map(s => s.trim()) : [];

  const inst = { addr, mnem, ops, raw, lineNum };

  // Pseudo-instructions and real instructions
  switch (mnem) {
    // --- No operands ---
    case 'nop':     inst.type = 'r'; inst.fn = 'add'; inst.rd = 0; inst.rs1 = 0; inst.rs2 = 0; break;
    case 'ret':     inst.type = 'j'; inst.fn = 'jalr'; inst.rd = 0; inst.rs1 = 1; inst.imm = 0; break;
    case 'ecall':   inst.type = 'syscall'; break;
    case 'ebreak':  inst.type = 'break'; break;
    case 'fence':   inst.type = 'fence'; break;
    case 'fence.i': inst.type = 'fence'; break;

    // --- One operand (register) ---
    case 'jr':      inst.type = 'j'; inst.fn = 'jalr'; inst.rd = 0; inst.rs1 = regNum(ops[0]); inst.imm = 0; break;

    // --- Two operands ---
    case 'mv':
      inst.type = 'r'; inst.fn = 'add'; inst.rd = regNum(ops[0]); inst.rs1 = regNum(ops[1]); inst.rs2 = 0; break;
    case 'neg':
      inst.type = 'r'; inst.fn = 'sub'; inst.rd = regNum(ops[0]); inst.rs1 = 0; inst.rs2 = regNum(ops[1]); break;
    case 'not':
      inst.type = 'r'; inst.fn = 'xori'; inst.rd = regNum(ops[0]); inst.rs1 = regNum(ops[1]); inst.imm = -1; inst.type = 'i'; break;
    case 'j':
      inst.type = 'j'; inst.fn = 'jal'; inst.rd = 0; inst.imm = resolveImm(ops[0], labels, addr); break;
    case 'call':
      inst.type = 'j'; inst.fn = 'jal'; inst.rd = 1; inst.imm = resolveImm(ops[0], labels, addr); break;
    case 'bnez':
      inst.type = 'b'; inst.fn = 'bne'; inst.rs1 = regNum(ops[0]); inst.rs2 = 0; inst.imm = resolveImm(ops[1], labels, addr); break;
    case 'beqz':
      inst.type = 'b'; inst.fn = 'beq'; inst.rs1 = regNum(ops[0]); inst.rs2 = 0; inst.imm = resolveImm(ops[1], labels, addr); break;
    case 'blez':
      inst.type = 'b'; inst.fn = 'ble'; inst.rs1 = regNum(ops[0]); inst.rs2 = 0; inst.imm = resolveImm(ops[1], labels, addr); break;
    case 'bgez':
      inst.type = 'b'; inst.fn = 'bge'; inst.rs1 = regNum(ops[0]); inst.rs2 = 0; inst.imm = resolveImm(ops[1], labels, addr); break;
    case 'bltz':
      inst.type = 'b'; inst.fn = 'blt'; inst.rs1 = regNum(ops[0]); inst.rs2 = 0; inst.imm = resolveImm(ops[1], labels, addr); break;
    case 'bgtz':
      inst.type = 'b'; inst.fn = 'bgt'; inst.rs1 = regNum(ops[0]); inst.rs2 = 0; inst.imm = resolveImm(ops[1], labels, addr); break;
    case 'ble':
      inst.type = 'b'; inst.fn = 'bge'; inst.rs1 = regNum(ops[1]); inst.rs2 = regNum(ops[0]); inst.imm = resolveImm(ops[2], labels, addr); break;
    case 'bgt':
      inst.type = 'b'; inst.fn = 'blt'; inst.rs1 = regNum(ops[1]); inst.rs2 = regNum(ops[0]); inst.imm = resolveImm(ops[2], labels, addr); break;
    case 'bleu':
      inst.type = 'b'; inst.fn = 'bgeu'; inst.rs1 = regNum(ops[1]); inst.rs2 = regNum(ops[0]); inst.imm = resolveImm(ops[2], labels, addr); break;
    case 'bgtu':
      inst.type = 'b'; inst.fn = 'bltu'; inst.rs1 = regNum(ops[1]); inst.rs2 = regNum(ops[0]); inst.imm = resolveImm(ops[2], labels, addr); break;

    // --- li / la (load immediate / load address) ---
    case 'li':
      inst.type = 'li'; inst.rd = regNum(ops[0]); inst.imm = parseNum(ops[1]); break;
    case 'la':
      inst.type = 'li'; inst.rd = regNum(ops[0]); inst.imm = labels[ops[1]] || 0; break;
    case 'lui':
      inst.type = 'lui'; inst.rd = regNum(ops[0]); inst.imm = parseNum(ops[1]); break;
    case 'auipc':
      inst.type = 'auipc'; inst.rd = regNum(ops[0]); inst.imm = parseNum(ops[1]); break;

    // --- CSR ---
    case 'csrr':
      inst.type = 'csr'; inst.fn = 'csrr'; inst.rd = regNum(ops[0]); inst.csr = ops[1]; break;
    case 'csrw':
      inst.type = 'csr'; inst.fn = 'csrw'; inst.rs1 = regNum(ops[1]); inst.csr = ops[0]; break;
    case 'csrrw':
      inst.type = 'csr'; inst.fn = 'csrrw'; inst.rd = regNum(ops[0]); inst.csr = ops[1]; inst.rs1 = regNum(ops[2]); break;

    // --- R-type arithmetic ---
    case 'add':  case 'sub': case 'sll': case 'slt':
    case 'sltu': case 'xor': case 'srl': case 'sra':
    case 'or':   case 'and':
      inst.type = 'r'; inst.fn = mnem; inst.rd = regNum(ops[0]); inst.rs1 = regNum(ops[1]); inst.rs2 = regNum(ops[2]); break;

    // --- M extension ---
    case 'mul':   case 'mulh':  case 'mulhsu': case 'mulhu':
    case 'div':   case 'divu':  case 'rem':    case 'remu':
      inst.type = 'r'; inst.fn = mnem; inst.rd = regNum(ops[0]); inst.rs1 = regNum(ops[1]); inst.rs2 = regNum(ops[2]); break;

    // --- I-type immediate ---
    case 'addi':  case 'slli': case 'slti': case 'sltiu':
    case 'xori':  case 'srli': case 'srai': case 'ori': case 'andi':
      inst.type = 'i'; inst.fn = mnem; inst.rd = regNum(ops[0]); inst.rs1 = regNum(ops[1]); inst.imm = parseNum(ops[2]); break;

    // --- Load ---
    case 'lw':  case 'ld':  case 'lb':  case 'lbu': case 'lh': case 'lhu': case 'lwu':
      inst.type = 'load'; inst.fn = mnem; inst.rd = regNum(ops[0]);
      { const m = parseMemOperand(ops[1]); inst.rs1 = regNum(m.base); inst.imm = m.offset; } break;

    // --- Store ---
    case 'sw':  case 'sd':  case 'sb':  case 'sh':
      inst.type = 'store'; inst.fn = mnem; inst.rs2 = regNum(ops[0]);
      { const m = parseMemOperand(ops[1]); inst.rs1 = regNum(m.base); inst.imm = m.offset; } break;

    // --- Branches ---
    case 'beq':  case 'bne':  case 'blt':  case 'bge':
    case 'bltu': case 'bgeu':
      inst.type = 'b'; inst.fn = mnem; inst.rs1 = regNum(ops[0]); inst.rs2 = regNum(ops[1]); inst.imm = resolveImm(ops[2], labels, addr); break;

    // --- Jumps ---
    case 'jal':
      if (ops.length === 1) {
        inst.type = 'j'; inst.fn = 'jal'; inst.rd = 1; inst.imm = resolveImm(ops[0], labels, addr);
      } else {
        inst.type = 'j'; inst.fn = 'jal'; inst.rd = regNum(ops[0]); inst.imm = resolveImm(ops[1], labels, addr);
      } break;
    case 'jalr':
      if (ops.length === 1) {
        inst.type = 'j'; inst.fn = 'jalr'; inst.rd = 1; inst.rs1 = regNum(ops[0]); inst.imm = 0;
      } else {
        inst.type = 'j'; inst.fn = 'jalr'; inst.rd = regNum(ops[0]);
        const m = parseMemOperand(ops[1]); inst.rs1 = regNum(m.base); inst.imm = m.offset;
      } break;

    // --- sret / mret ---
    case 'sret': inst.type = 'sret'; break;
    case 'mret': inst.type = 'mret'; break;
    case 'wfi':  inst.type = 'wfi'; break;

    default:
      inst.type = 'error'; inst.error = 'unknown instruction: ' + mnem;
  }

  return inst;
}

function regNum(name) {
  if (!name) return 0;
  name = name.toLowerCase().replace(/^x/, 'x');
  if (REG_NAMES[name] !== undefined) return REG_NAMES[name];
  const n = parseInt(name.replace('x',''), 10);
  if (n >= 0 && n <= 31) return n;
  return 0;
}

function parseNum(s) {
  if (!s) return 0;
  s = s.trim();
  if (s.startsWith('-')) return -parseNum(s.slice(1));
  if (s.startsWith('0x')) return parseInt(s, 16);
  if (s.startsWith('0b')) return parseInt(s.slice(2), 2);
  return parseInt(s, 10);
}

function resolveImm(s, labels, addr) {
  if (!s) return 0;
  s = s.trim();
  if (labels[s] !== undefined) return labels[s] - addr;
  return parseNum(s);
}

function parseMemOperand(s) {
  s = s.trim();
  const m = s.match(/^\s*(-?\d+)?\s*\(\s*(\w+)\s*\)\s*$/);
  if (m) return { offset: m[1] ? parseInt(m[1], 10) : 0, base: m[2] };
  // Could be a label or plain number
  return { offset: 0, base: s };
}

// ============================================================
// EMULATOR
// ============================================================

function createEmulator() {
  return {
    regs: new BigInt64Array(32),
    pc: 0n,
    mem: new Map(),       // addr -> byte value
    csr: new Map(),       // csr name -> value
    output: '',
    exitCode: 0,
    halted: false,
    error: null,
    stepCount: 0,
    maxSteps: 100000,
    changedRegs: new Set(),
  };
}

function memWriteByte(emu, addr, val) {
  emu.mem.set(addr & 0xffffffffn, val & 0xff);
}
function memReadByte(emu, addr) {
  return emu.mem.get(addr & 0xffffffffn) || 0;
}

function memWrite(emu, addr, val, size) {
  addr = BigInt(addr);
  val = BigInt(val);
  for (let i = 0; i < size; i++) {
    memWriteByte(emu, addr + BigInt(i), Number((val >> BigInt(8*i)) & 0xffn));
  }
}

function memRead(emu, addr, size, signed) {
  addr = BigInt(addr);
  let val = 0n;
  for (let i = 0; i < size; i++) {
    val |= BigInt(memReadByte(emu, addr + BigInt(i))) << BigInt(8*i);
  }
  if (signed) {
    const bits = BigInt(size * 8);
    if (val & (1n << (bits - 1n))) {
      val = val - (1n << bits);
    }
  }
  return val;
}

function getReg(emu, n) {
  if (n === 0) return 0n;
  return emu.regs[n];
}
function setReg(emu, n, val) {
  if (n !== 0) {
    emu.regs[n] = BigInt(val);
    emu.changedRegs.add(n);
  }
}

function runProgram(emu, program) {
  // Load data section into memory
  for (const d of program.dataBytes) {
    memWrite(emu, d.addr, d.val, d.size);
  }

  // Find entry point
  const entry = program.labels['_start'] !== undefined ? program.labels['_start'] : 0;
  emu.pc = BigInt(entry);

  // Build instruction map by address
  const instMap = new Map();
  for (const inst of program.instructions) {
    instMap.set(inst.addr, inst);
  }

  while (!emu.halted && !emu.error && emu.stepCount < emu.maxSteps) {
    const inst = instMap.get(Number(emu.pc));
    if (!inst) {
      emu.error = 'No instruction at 0x' + emu.pc.toString(16);
      break;
    }
    step(emu, inst);
    emu.stepCount++;
  }

  if (emu.stepCount >= emu.maxSteps && !emu.halted) {
    emu.error = 'Max instruction limit reached (' + emu.maxSteps + '). Possible infinite loop.';
  }
}

function step(emu, inst) {
  emu.changedRegs.clear();
  const pc = emu.pc;
  let nextPc = pc + 4n;

  switch (inst.type) {
    case 'word':
      // .word directive in text - skip
      break;

    case 'r':
      executeR(emu, inst);
      break;

    case 'i':
      executeI(emu, inst);
      break;

    case 'li':
      setReg(emu, inst.rd, BigInt(inst.imm));
      break;

    case 'lui':
      setReg(emu, inst.rd, BigInt(inst.imm) << 12n);
      break;

    case 'auipc':
      setReg(emu, inst.rd, pc + (BigInt(inst.imm) << 12n));
      break;

    case 'load':
      executeLoad(emu, inst);
      break;

    case 'store':
      executeStore(emu, inst);
      break;

    case 'b':
      if (executeBranch(emu, inst)) {
        nextPc = pc + BigInt(inst.imm);
      }
      break;

    case 'j':
      if (inst.fn === 'jal') {
        setReg(emu, inst.rd, pc + 4n);
        nextPc = pc + BigInt(inst.imm);
      } else if (inst.fn === 'jalr') {
        const target = (getReg(emu, inst.rs1) + BigInt(inst.imm)) & ~1n;
        setReg(emu, inst.rd, pc + 4n);
        nextPc = target;
      }
      break;

    case 'syscall':
      executeSyscall(emu);
      break;

    case 'sret':
    case 'mret':
      // Simplified: just continue
      break;

    case 'fence':
    case 'break':
    case 'wfi':
      break;

    case 'csr':
      // Simplified CSR access
      if (inst.fn === 'csrr') {
        setReg(emu, inst.rd, BigInt(emu.csr.get(inst.csr) || 0));
      } else if (inst.fn === 'csrw') {
        emu.csr.set(inst.csr, Number(getReg(emu, inst.rs1)));
      } else if (inst.fn === 'csrrw') {
        const old = BigInt(emu.csr.get(inst.csr) || 0);
        emu.csr.set(inst.csr, Number(getReg(emu, inst.rs1)));
        setReg(emu, inst.rd, old);
      }
      break;

    case 'error':
      emu.error = inst.error + ' (line ' + inst.lineNum + ')';
      emu.halted = true;
      return;
  }

  emu.pc = nextPc;
}

function executeR(emu, inst) {
  const a = getReg(emu, inst.rs1);
  const b = getReg(emu, inst.rs2);
  let result = 0n;

  switch (inst.fn) {
    case 'add':   result = a + b; break;
    case 'sub':   result = a - b; break;
    case 'mul':   result = a * b; break;
    case 'div':   result = b !== 0n ? a / b : 0n; break;
    case 'divu':   result = b !== 0n ? BigInt.asUintN(64, a) / BigInt.asUintN(64, b) : 0n; break;
    case 'rem':   result = b !== 0n ? a % b : 0n; break;
    case 'remu':   result = b !== 0n ? BigInt.asUintN(64, a) % BigInt.asUintN(64, b) : 0n; break;
    case 'and':   result = a & b; break;
    case 'or':    result = a | b; break;
    case 'xor':   result = a ^ b; break;
    case 'sll':   result = a << (b & 63n); break;
    case 'srl':   result = BigInt.asUintN(64, a) >> (b & 63n); break;
    case 'sra':   result = a >> (b & 63n); break;
    case 'slt':   result = a < b ? 1n : 0n; break;
    case 'sltu':  result = BigInt.asUintN(64, a) < BigInt.asUintN(64, b) ? 1n : 0n; break;
    case 'mulh':  result = BigInt.asIntN(64, (a * b) >> 64n); break;
    case 'mulhu': result = BigInt.asUintN(64, (BigInt.asUintN(64,a) * BigInt.asUintN(64,b)) >> 64n); break;
    default: break;
  }
  setReg(emu, inst.rd, result);
}

function executeI(emu, inst) {
  const a = getReg(emu, inst.rs1);
  const imm = BigInt(inst.imm);
  let result = 0n;

  switch (inst.fn) {
    case 'addi':  result = a + imm; break;
    case 'xori':  result = a ^ imm; break;
    case 'ori':   result = a | imm; break;
    case 'andi':  result = a & imm; break;
    case 'slti':  result = a < imm ? 1n : 0n; break;
    case 'sltiu': result = BigInt.asUintN(64, a) < BigInt.asUintN(64, imm) ? 1n : 0n; break;
    case 'slli':  result = a << (imm & 63n); break;
    case 'srli':  result = BigInt.asUintN(64, a) >> (imm & 63n); break;
    case 'srai':  result = a >> (imm & 63n); break;
    default: break;
  }
  setReg(emu, inst.rd, result);
}

function executeLoad(emu, inst) {
  const addr = getReg(emu, inst.rs1) + BigInt(inst.imm);
  let val = 0n;
  switch (inst.fn) {
    case 'lb':  val = memRead(emu, addr, 1, true); break;
    case 'lbu': val = memRead(emu, addr, 1, false); break;
    case 'lh':  val = memRead(emu, addr, 2, true); break;
    case 'lhu': val = memRead(emu, addr, 2, false); break;
    case 'lw':  val = memRead(emu, addr, 4, true); break;
    case 'lwu': val = memRead(emu, addr, 4, false); break;
    case 'ld':  val = memRead(emu, addr, 8, true); break;
    default: break;
  }
  setReg(emu, inst.rd, val);
}

function executeStore(emu, inst) {
  const val = getReg(emu, inst.rs2);
  const addr = getReg(emu, inst.rs1) + BigInt(inst.imm);
  switch (inst.fn) {
    case 'sb': memWrite(emu, addr, val, 1); break;
    case 'sh': memWrite(emu, addr, val, 2); break;
    case 'sw': memWrite(emu, addr, val, 4); break;
    case 'sd': memWrite(emu, addr, val, 8); break;
    default: break;
  }
}

function executeBranch(emu, inst) {
  const a = getReg(emu, inst.rs1);
  const b = getReg(emu, inst.rs2);
  switch (inst.fn) {
    case 'beq':  return a === b;
    case 'bne':  return a !== b;
    case 'blt':  return a < b;
    case 'bge':  return a >= b;
    case 'bltu': return BigInt.asUintN(64, a) < BigInt.asUintN(64, b);
    case 'bgeu': return BigInt.asUintN(64, a) >= BigInt.asUintN(64, b);
    default: return false;
  }
}

function executeSyscall(emu) {
  const num = Number(getReg(emu, 17)); // a7
  switch (num) {
    case 93: // exit
      emu.exitCode = Number(getReg(emu, 10)); // a0
      emu.halted = true;
      break;
    case 64: // write
      {
        const fd = Number(getReg(emu, 10));     // a0
        const buf = getReg(emu, 11);            // a1
        const count = Number(getReg(emu, 12));   // a2
        let str = '';
        for (let i = 0; i < count; i++) {
          const byte = memReadByte(emu, buf + BigInt(i));
          if (byte === 0) break;
          str += String.fromCharCode(byte);
        }
        if (fd === 1 || fd === 2) {
          emu.output += str;
        }
        setReg(emu, 10, BigInt(count)); // return bytes written
      }
      break;
    case 63: // read
      // Simplified: return 0 (no input available)
      setReg(emu, 10, 0n);
      break;
    case 214: // brk
      setReg(emu, 10, getReg(emu, 10)); // return requested address
      break;
    case 226: // mmap (simplified)
      setReg(emu, 10, 0x20000n); // return a fixed address
      break;
    default:
      // Unknown syscall - ignore
      break;
  }
}

// ============================================================
// DISASSEMBLER (for display)
// ============================================================

function disassemble(inst) {
  if (inst.type === 'word') return '.word 0x' + (inst.val >>> 0).toString(16);
  if (inst.type === 'error') return '; ERROR: ' + inst.error;

  const r = (n) => REG_ABBR[n] || ('x' + n);
  let s = inst.mnem;

  switch (inst.type) {
    case 'r':
      return `${inst.fn} ${r(inst.rd)}, ${r(inst.rs1)}, ${r(inst.rs2)}`;
    case 'i':
      return `${inst.fn} ${r(inst.rd)}, ${r(inst.rs1)}, ${inst.imm}`;
    case 'li':
      return `li ${r(inst.rd)}, ${inst.imm}`;
    case 'lui':
      return `lui ${r(inst.rd)}, ${inst.imm}`;
    case 'auipc':
      return `auipc ${r(inst.rd)}, ${inst.imm}`;
    case 'load':
      return `${inst.fn} ${r(inst.rd)}, ${inst.imm}(${r(inst.rs1)})`;
    case 'store':
      return `${inst.fn} ${r(inst.rs2)}, ${inst.imm}(${r(inst.rs1)})`;
    case 'b':
      return `${inst.fn} ${r(inst.rs1)}, ${r(inst.rs2)}, ${inst.imm >= 0 ? '+' : ''}${inst.imm}`;
    case 'j':
      if (inst.fn === 'jal') return `jal ${r(inst.rd)}, ${inst.imm >= 0 ? '+' : ''}${inst.imm}`;
      if (inst.fn === 'jalr') return `jalr ${r(inst.rd)}, ${r(inst.rs1)}, ${inst.imm}`;
      return inst.mnem;
    case 'syscall':
      return 'ecall';
    case 'csr':
      return `${inst.fn} ${inst.csr || ''} ${r(inst.rd || inst.rs1) || ''}`;
    default:
      return inst.mnem;
  }
}

// ============================================================
// EXPORT
// ============================================================
global.RISCV = {
  assemble,
  createEmulator,
  runProgram,
  disassemble,
  REG_ABBR,
};

})(window);
