/* ============================================================
   VGU OS Lab Simulator - Compiler Explorer Style
   ============================================================
   Pre-loaded C/C++ example programs for each lab.
   Each example has: id, title, lang, code
   ============================================================ */

(function(global) {
'use strict';

const EXAMPLES = [
  {
    id: 'c-hello',
    title: 'C: Hello World',
    lang: 'c',
    code:
`#include <stdio.h>

int main(void) {
    printf("Hello, World!\\n");
    return 0;
}`
  },

  {
    id: 'c-add',
    title: 'C: Arithmetic (add)',
    lang: 'c',
    code:
`int add(int a, int b) {
    return a + b;
}

int main(void) {
    return add(10, 20);
}`
  },

  {
    id: 'c-sum-loop',
    title: 'C: Sum 1 to N (loop)',
    lang: 'c',
    code:
`int sum_to_n(int n) {
    int sum = 0;
    for (int i = 1; i <= n; i++) {
        sum += i;
    }
    return sum;
}

int main(void) {
    return sum_to_n(10);
}`
  },

  {
    id: 'c-func-call',
    title: 'C: Function Call',
    lang: 'c',
    code:
`int square(int x) {
    return x * x;
}

int main(void) {
    return square(7);
}`
  },

  {
    id: 'c-recursion',
    title: 'C: Recursive Factorial',
    lang: 'c',
    code:
`int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main(void) {
    return factorial(5);
}`
  },

  {
    id: 'c-arrays',
    title: 'C: Array Sum',
    lang: 'c',
    code:
`int sum_array(int *arr, int n) {
    int sum = 0;
    for (int i = 0; i < n; i++) {
        sum += arr[i];
    }
    return sum;
}

int main(void) {
    int arr[] = {10, 20, 30, 40, 50};
    return sum_array(arr, 5);
}`
  },

  {
    id: 'c-structs',
    title: 'C: Struct Access',
    lang: 'c',
    code:
`struct point {
    int x;
    int y;
};

int manhattan(struct point p) {
    return p.x + p.y;
}

int main(void) {
    struct point p = {3, 4};
    return manhattan(p);
}`
  },

  {
    id: 'c-pointers',
    title: 'C: Pointer Dereference',
    lang: 'c',
    code:
`int deref(int *p) {
    return *p;
}

int main(void) {
    int x = 42;
    return deref(&x);
}`
  },

  {
    id: 'c-switch',
    title: 'C: Switch Statement',
    lang: 'c',
    code:
`int classify(int n) {
    switch (n) {
        case 0:  return 100;
        case 1:  return 200;
        case 2:  return 300;
        default: return -1;
    }
}

int main(void) {
    return classify(2);
}`
  },

  {
    id: 'c-bitops',
    title: 'C: Bitwise Operations',
    lang: 'c',
    code:
`int bit_ops(int a, int b) {
    int x = a & b;
    int y = a | b;
    int z = a ^ b;
    return x + y + z;
}

int main(void) {
    return bit_ops(0xF0, 0x0F);
}`
  },

  {
    id: 'cpp-classes',
    title: 'C++: Simple Class',
    lang: 'c++',
    code:
`class Calculator {
public:
    int add(int a, int b) { return a + b; }
    int mul(int a, int b) { return a * b; }
};

int main() {
    Calculator calc;
    return calc.add(3, 4);
}`
  },

  {
    id: 'cpp-templates',
    title: 'C++: Template Function',
    lang: 'c++',
    code:
`template<typename T>
T max_val(T a, T b) {
    return (a > b) ? a : b;
}

int main() {
    return max_val(10, 20);
}`
  },

  {
    id: 'cpp-stl',
    title: 'C++: STL Vector',
    lang: 'c++',
    code:
`#include <vector>
#include <numeric>

int sum_vector() {
    std::vector<int> v = {1, 2, 3, 4, 5};
    int sum = 0;
    for (int x : v) sum += x;
    return sum;
}

int main() {
    return sum_vector();
}`
  },

  // ===== RISC-V Assembly (for in-browser execution) =====
  {
    id: 'rv-hello',
    title: 'RISC-V ASM: Hello World',
    lang: 'riscv-asm',
    code:
`# RISC-V Hello World via raw syscall
# Writes "Hello, RISC-V!" to stdout, then exits

.globl _start
_start:
    li   a7, 64        # SYS_write = 64
    li   a0, 1         # fd = stdout
    la   a1, msg       # buffer address
    li   a2, 14        # length
    ecall

    li   a7, 93        # SYS_exit = 93
    li   a0, 0         # status = 0
    ecall

.data
msg:   .ascii "Hello, RISC-V!"`
  },

  {
    id: 'rv-sum',
    title: 'RISC-V ASM: Sum 1 to 10',
    lang: 'riscv-asm',
    code:
`# RISC-V Loop: sum = 1 + 2 + ... + 10 = 55
.globl _start
_start:
    li   t0, 0         # sum = 0
    li   t1, 1         # i = 1
    li   t2, 11        # limit
loop:
    bge  t1, t2, done
    add  t0, t0, t1    # sum += i
    addi t1, t1, 1     # i++
    j    loop
done:
    mv   a0, t0       # a0 = 55
    li   a7, 93
    ecall`
  },

  {
    id: 'rv-fact',
    title: 'RISC-V ASM: Recursive Factorial',
    lang: 'riscv-asm',
    code:
`# RISC-V Recursion: factorial(5) = 120
.globl _start
_start:
    li   a0, 5
    call factorial
    li   a7, 93
    ecall

factorial:
    addi  sp, sp, -16
    sd    ra, 8(sp)
    sd    s0, 0(sp)
    mv    s0, a0
    li    t0, 1
    ble   s0, t0, base
    addi  a0, s0, -1
    call  factorial
    mul   a0, s0, a0
    j     fact_end
base:
    li    a0, 1
fact_end:
    ld    ra, 8(sp)
    ld    s0, 0(sp)
    addi  sp, sp, 16
    ret`
  },
];

// ===== Compiler definitions for Godbolt API =====
const COMPILERS = {
  'c': [
    { id: 'g132',      name: 'x86-64 gcc 13.2',     target: 'x86_64' },
    { id: 'g162',      name: 'x86-64 gcc 16.2',     target: 'x86_64' },
    { id: 'clang1810', name: 'x86-64 clang 18.1',  target: 'x86_64' },
    { id: 'arm64g1320', name: 'ARM64 gcc 13.2',     target: 'aarch64' },
    { id: 'arm64g1610', name: 'ARM64 gcc 16.1',     target: 'aarch64' },
    { id: 'rv64-gcc1320', name: 'RISC-V 64 gcc 13.2', target: 'riscv64' },
    { id: 'rv64-gcc1610', name: 'RISC-V 64 gcc 16.1', target: 'riscv64' },
    { id: 'mips64g1320', name: 'MIPS64 gcc 13.2',   target: 'mips64' },
    { id: 'mips64g1610', name: 'MIPS64 gcc 16.1',   target: 'mips64' },
  ],
  'c++': [
    { id: 'g132',      name: 'x86-64 g++ 13.2',     target: 'x86_64' },
    { id: 'g162',      name: 'x86-64 g++ 16.2',     target: 'x86_64' },
    { id: 'clang1810', name: 'x86-64 clang++ 18.1', target: 'x86_64' },
    { id: 'arm64g1320', name: 'ARM64 g++ 13.2',     target: 'aarch64' },
    { id: 'rv64-gcc1320', name: 'RISC-V 64 g++ 13.2', target: 'riscv64' },
    { id: 'mips64g1320', name: 'MIPS64 g++ 13.2',   target: 'mips64' },
  ],
  'riscv-asm': [
    { id: 'local',     name: 'In-browser RISC-V Emulator', target: 'riscv64' },
  ],
};

global.EXAMPLES = EXAMPLES;
global.COMPILERS = COMPILERS;

})(window);
