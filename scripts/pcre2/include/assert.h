/* PCRE2 を WebAssembly 向けにビルドするための、最小の <assert.h>。成り立たなければ、その場で止める（trap） */
#ifndef PQ_ASSERT_H
#define PQ_ASSERT_H
#define assert(condition) ((condition) ? (void)0 : __builtin_trap())
#endif
