/* PCRE2 を WebAssembly 向けにビルドするための、最小の <stdlib.h>。実体は ../libc.c */
#ifndef PQ_STDLIB_H
#define PQ_STDLIB_H
#include <stddef.h>
void *malloc(size_t size);
void free(void *ptr);
_Noreturn void abort(void);
#endif
