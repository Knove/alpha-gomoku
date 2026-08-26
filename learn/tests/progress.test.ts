import { test } from "node:test";
import assert from "node:assert/strict";
import { passQuiz, type Progress } from "../src/framework/progress.ts";

const fresh: Progress = { unlocked: 0, quizPassed: {} };

test("passQuiz 过关即解锁下一课,且不改旧进度(纯函数)", () => {
  const next = passQuiz(fresh, "prologue", 15);
  assert.equal(next.unlocked, 1);
  assert.equal(next.quizPassed["prologue"], true);
  assert.equal(fresh.unlocked, 0);
  assert.equal(fresh.quizPassed["prologue"], undefined);
});

test("passQuiz 重复过关幂等,到最后一课封顶(cap = lessonCount − 1)", () => {
  const full: Progress = { unlocked: 14, quizPassed: { l13: true } };
  assert.equal(passQuiz(full, "l13", 15).unlocked, 14);
  assert.equal(passQuiz(full, "graduation", 15).unlocked, 14);
  const mid: Progress = { unlocked: 3, quizPassed: {} };
  assert.equal(passQuiz(mid, "l03", 15).unlocked, 4);
});
