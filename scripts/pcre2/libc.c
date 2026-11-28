/*
 * PCRE2 が使う標準ライブラリの関数だけを持つ、最小の実装。
 * WebAssembly のモジュールが外の関数（import）を 1 つも要らないようにするために、libc を持ち込まずにこれを使う。
 * -fno-builtin を付けてビルドする（付けないと、コンパイラがループを memcpy の呼び出しに置き換え、自分自身を呼び続ける）。
 */
#include <ctype.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

void *memcpy(void *dest, const void *src, size_t n) {
  unsigned char *d = dest;
  const unsigned char *s = src;
  while (n--) *d++ = *s++;
  return dest;
}

void *memmove(void *dest, const void *src, size_t n) {
  unsigned char *d = dest;
  const unsigned char *s = src;
  if (d < s) {
    while (n--) *d++ = *s++;
  } else {
    while (n--) d[n] = s[n];
  }
  return dest;
}

void *memset(void *dest, int c, size_t n) {
  unsigned char *d = dest;
  while (n--) *d++ = (unsigned char)c;
  return dest;
}

int memcmp(const void *a, const void *b, size_t n) {
  const unsigned char *x = a;
  const unsigned char *y = b;
  for (; n--; x++, y++) {
    if (*x != *y) return *x - *y;
  }
  return 0;
}

void *memchr(const void *s, int c, size_t n) {
  const unsigned char *p = s;
  for (; n--; p++) {
    if (*p == (unsigned char)c) return (void *)p;
  }
  return NULL;
}

size_t strlen(const char *s) {
  size_t n = 0;
  while (s[n]) n++;
  return n;
}

int strcmp(const char *a, const char *b) {
  while (*a && *a == *b) a++, b++;
  return (unsigned char)*a - (unsigned char)*b;
}

int strncmp(const char *a, const char *b, size_t n) {
  for (; n--; a++, b++) {
    if (*a != *b || !*a) return (unsigned char)*a - (unsigned char)*b;
  }
  return 0;
}

char *strchr(const char *s, int c) {
  for (;; s++) {
    if (*s == (char)c) return (char *)s;
    if (!*s) return NULL;
  }
}

int isdigit(int c) { return c >= '0' && c <= '9'; }
int islower(int c) { return c >= 'a' && c <= 'z'; }
int isupper(int c) { return c >= 'A' && c <= 'Z'; }
int isalpha(int c) { return islower(c) || isupper(c); }
int isalnum(int c) { return isalpha(c) || isdigit(c); }
int iscntrl(int c) { return (c >= 0 && c < 32) || c == 127; }
int isgraph(int c) { return c > 32 && c < 127; }
int isprint(int c) { return c >= 32 && c < 127; }
int ispunct(int c) { return isgraph(c) && !isalnum(c); }
int isspace(int c) { return c == ' ' || (c >= '\t' && c <= '\r'); }
int isxdigit(int c) { return isdigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'); }
int tolower(int c) { return isupper(c) ? c + 32 : c; }
int toupper(int c) { return islower(c) ? c - 32 : c; }

_Noreturn void abort(void) { __builtin_trap(); }

/*
 * メモリの確保。空き領域を番地の順につないだ一覧から、最初に入る場所を使う（first fit）。
 * 返すときに、隣り合う空き領域をつなぎ直す。足りなければ、WebAssembly のメモリをページ（64KiB）単位で広げる。
 */
#define PAGE 65536u
#define ALIGN 8u

typedef struct block {
  size_t size; /* ヘッダーを含む大きさ */
  struct block *next; /* 空き領域の一覧での次。使用中は使わない */
} block;

extern unsigned char __heap_base;
static block *free_list;
static uintptr_t heap_end;

static block *grow(size_t need) {
  if (heap_end == 0) heap_end = ((uintptr_t)&__heap_base + ALIGN - 1) & ~(uintptr_t)(ALIGN - 1);
  uintptr_t limit = (uintptr_t)__builtin_wasm_memory_size(0) * PAGE;
  if (heap_end + need > limit) {
    size_t pages = (heap_end + need - limit + PAGE - 1) / PAGE;
    if (__builtin_wasm_memory_grow(0, pages) == (size_t)-1) return NULL;
  }
  block *b = (block *)heap_end;
  b->size = need;
  heap_end += need;
  return b;
}

void *malloc(size_t size) {
  if (size > (size_t)-1 - sizeof(block) - ALIGN) return NULL;
  size_t need = (size + sizeof(block) + ALIGN - 1) & ~(size_t)(ALIGN - 1);
  block **link = &free_list;
  for (block *b = free_list; b; link = &b->next, b = b->next) {
    if (b->size < need) continue;
    if (b->size - need >= sizeof(block) + ALIGN) {
      block *rest = (block *)((unsigned char *)b + need);
      rest->size = b->size - need;
      rest->next = b->next;
      b->size = need;
      *link = rest;
    } else {
      *link = b->next;
    }
    return b + 1;
  }
  block *b = grow(need);
  return b ? b + 1 : NULL;
}

void free(void *ptr) {
  if (!ptr) return;
  block *b = (block *)ptr - 1;
  block **link = &free_list;
  block *prev = NULL;
  while (*link && *link < b) {
    prev = *link;
    link = &prev->next;
  }
  b->next = *link;
  *link = b;
  if (b->next && (unsigned char *)b + b->size == (unsigned char *)b->next) {
    b->size += b->next->size;
    b->next = b->next->next;
  }
  if (prev && (unsigned char *)prev + prev->size == (unsigned char *)b) {
    prev->size += b->size;
    prev->next = b->next;
  }
}
