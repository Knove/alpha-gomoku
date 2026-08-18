import { test } from "node:test";
import assert from "node:assert/strict";
import { passQuiz, type Progress } from "../src/framework/progress.ts";

const fresh: Progress = { unlocked: 0, quizPassed: {} };

test("passQuiz 过关即解锁下一课,且不改旧进度(纯函数)", () => {
  const next = passQuiz(fresh, "prologue", 11);
  assert.equal(next.unlocked, 1);
  assert.equal(next.quizPassed["prologue"], true);
  assert.equal(fresh.unlocked, 0);
  assert.equal(fresh.quizPassed["prologue"], undefined);
});

test("passQuiz 重复过关幂等,到最后一课封顶", () => {
  const full: Progress = { unlocked: 10, quizPassed: { l09: true } };
  assert.equal(passQuiz(full, "l09", 11).unlocked, 10);
  assert.equal(passQuiz(full, "graduation", 11).unlocked, 10);
  const mid: Progress = { unlocked: 3, quizPassed: {} };
  assert.equal(passQuiz(mid, "l02", 11).unlocked, 4);
});
