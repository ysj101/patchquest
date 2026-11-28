/* PCRE2 を WebAssembly 向けにビルドするための、最小の <ctype.h>（ASCII の "C" ロケールだけ）。実体は ../libc.c */
#ifndef PQ_CTYPE_H
#define PQ_CTYPE_H
int isalnum(int c);
int isalpha(int c);
int iscntrl(int c);
int isdigit(int c);
int isgraph(int c);
int islower(int c);
int isprint(int c);
int ispunct(int c);
int isspace(int c);
int isupper(int c);
int isxdigit(int c);
int tolower(int c);
int toupper(int c);
#endif
