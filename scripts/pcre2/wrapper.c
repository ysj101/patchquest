/*
 * PatchQuest が PCRE2 を呼ぶための、小さな入口。JavaScript 側（runtimes/browser/regex.ts）は、ここで公開する関数だけを使う。
 * 照合の途中で、エンジンがパターンの項目を 1 つ試すたびに PCRE2 が呼ぶ関数（callout）で、回数を数える。
 * 数えるのは「項目を試した回数」で、後戻りの回数そのものではない。
 */
#define PCRE2_CODE_UNIT_WIDTH 8
#include <stdint.h>
#include <stdlib.h>
#include "pcre2.h"

#define EXPORT(name) __attribute__((export_name(#name)))
static double steps;
static int last_error;
static uint32_t last_offset;

static int on_callout(pcre2_callout_block *block, void *data) {
  (void)block;
  (void)data;
  steps += 1;
  return 0;
}

EXPORT(pq_alloc) void *pq_alloc(uint32_t size) { return malloc(size); }
EXPORT(pq_free) void pq_free(void *ptr) { free(ptr); }

/* パターンをコンパイルする。失敗したら 0 を返し、理由は pq_error・pq_error_offset で分かる */
EXPORT(pq_compile) pcre2_code *pq_compile(const uint8_t *pattern, uint32_t length, uint32_t options) {
  int code = 0;
  PCRE2_SIZE offset = 0;
  pcre2_code *compiled = pcre2_compile(pattern, length, options, &code, &offset, NULL);
  last_error = compiled ? 0 : code;
  last_offset = (uint32_t)offset;
  return compiled;
}

EXPORT(pq_release) void pq_release(pcre2_code *code) { pcre2_code_free(code); }
EXPORT(pq_error) int pq_error(void) { return last_error; }
EXPORT(pq_error_offset) uint32_t pq_error_offset(void) { return last_offset; }

/*
 * 照合する。戻り値は pcre2_match のもの（1 以上：一致、-1：一致しない、-47：match limit に達した、など）。
 * match_limit が 0 なら、PCRE2 の既定の上限のまま照合する。
 */
EXPORT(pq_match) int pq_match(const pcre2_code *code, const uint8_t *subject, uint32_t length, uint32_t match_limit) {
  steps = 0;
  pcre2_match_context *context = pcre2_match_context_create(NULL);
  pcre2_match_data *data = pcre2_match_data_create_from_pattern(code, NULL);
  int result = PCRE2_ERROR_NOMEMORY;
  if (context && data) {
    if (match_limit) pcre2_set_match_limit(context, match_limit);
    pcre2_set_callout(context, on_callout, NULL);
    result = pcre2_match(code, subject, length, 0, 0, data, context);
  }
  pcre2_match_data_free(data);
  pcre2_match_context_free(context);
  return result;
}

/* 直前の照合で、エンジンがパターンの項目を試した回数（callout が呼ばれた回数） */
EXPORT(pq_steps) double pq_steps(void) { return steps; }

/* PCRE2 のエラーコードの説明（英語）を buffer に書き、長さを返す */
EXPORT(pq_message) int pq_message(int code, uint8_t *buffer, uint32_t size) { return pcre2_get_error_message(code, buffer, size); }

/* PCRE2 の版（例：10.49 2026-09-28）を buffer に書き、終端を含む長さを返す */
EXPORT(pq_version) int pq_version(uint8_t *buffer) { return pcre2_config(PCRE2_CONFIG_VERSION, buffer); }
