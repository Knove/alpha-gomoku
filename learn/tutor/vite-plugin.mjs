import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import {
  buildAssessmentPrompt,
  buildTutorPrompt,
  guardAssessment,
  isQuizWrapUp,
  parseAssessment,
  validateTutorReply,
} from "./prompt.mjs"
import { assessmentRequestError, lessonContract, withAuthoritativeContract } from "./contract.mjs"

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url))
// 中文 UTF-8 约占 3 字节/字；需容纳 60k 字正文、引用、题库与 16 轮对话。
const MAX_BODY = 700_000
const MAX_MESSAGE = 8_000
const TUTOR_TIMEOUT_MS = 120_000
// 客户端 130 秒放弃；服务端把首次回复、一次返工和解析都收在更短的预算内。
const TUTOR_REQUEST_BUDGET_MS = 118_000
const MIN_REPAIR_BUDGET_MS = 12_000
const MAX_CONCURRENT = 2
// 慢速上传也会占用并发槽；请求体必须在进入 Codex 前完成。
const BODY_READ_TIMEOUT_MS = 12_000

export const TUTOR_LIMITS = Object.freeze({
  maxBodyBytes: MAX_BODY,
  maxMessageChars: MAX_MESSAGE,
  maxConcurrent: MAX_CONCURRENT,
  requestBudgetMs: TUTOR_REQUEST_BUDGET_MS,
  bodyReadTimeoutMs: BODY_READ_TIMEOUT_MS,
})

let activeRequests = 0
let healthCache = null

function json(res, status, payload) {
  if (res.writableEnded || res.destroyed) return
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Content-Length", Buffer.byteLength(body))
  res.end(body)
}

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  error.expose = true
  return error
}

function abortedError() {
  const error = new Error("导师请求已取消")
  error.status = 499
  error.expose = true
  error.cancelled = true
  return error
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"])

function hostnameFromAuthority(host) {
  if (typeof host !== "string" || !host.trim()) return null
  try {
    const parsed = new URL(`http://${host.trim()}`)
    if (parsed.username || parsed.password) return null
    return parsed.hostname.toLowerCase()
  } catch {
    return null
  }
}

/** 只接受回环地址名；防止 DNS rebinding 用攻击者域名解析到 127.0.0.1。 */
export function isLoopbackHost(host) {
  return LOOPBACK_HOSTNAMES.has(hostnameFromAuthority(host) ?? "")
}

/** Origin 必须和本次请求的协议、主机、端口完全一致，且 Host 必须是回环地址名。 */
export function originMatchesRequest(origin, host, encrypted = false) {
  if (!origin || !host) return false
  try {
    const parsed = new URL(origin)
    if (parsed.username || parsed.password) return false
    const expectedProtocol = encrypted ? "https:" : "http:"
    if (parsed.protocol !== expectedProtocol) return false
    if (!isLoopbackHost(host)) return false
    return parsed.host.toLowerCase() === String(host).trim().toLowerCase()
  } catch {
    return false
  }
}

function remainingMs(deadline) {
  return Math.max(0, deadline - Date.now())
}

function codexBinary() {
  return process.env.CODEX_TUTOR_BIN || "codex"
}

function checkCodex() {
  const now = Date.now()
  if (healthCache && now - healthCache.at < 10_000) return healthCache.value
  const result = spawnSync(codexBinary(), ["--version"], {
    encoding: "utf8",
    timeout: 4000,
    env: { ...process.env, NO_COLOR: "1" },
  })
  const value = {
    available: result.status === 0,
    version: result.status === 0 ? result.stdout.trim().split("\n")[0] : null,
    reason: result.status === 0 ? null : "没有找到可用的本机 Codex CLI",
  }
  healthCache = { at: now, value }
  return value
}

/** 读取请求体；慢速上传或半截请求不能无限占住导师并发槽。 */
export function readBody(req, signal, timeoutMs = BODY_READ_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortedError())
    let size = 0
    let tooLarge = false
    let settled = false
    const chunks = []
    let timer = null
    const onData = (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_BODY) {
        tooLarge = true
        return
      }
      chunks.push(chunk)
    }
    const onEnd = () => {
      if (settled) return
      if (tooLarge) {
        const error = new Error("请求体过大")
        error.status = 413
        error.closeConnection = true
        return fail(error)
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"))
        if (settled) return
        settled = true
        cleanup()
        resolve(parsed)
      } catch {
        const error = new Error("请求不是合法 JSON")
        error.status = 400
        fail(error)
      }
    }
    const onError = (error) => fail(error)
    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort)
      if (timer) clearTimeout(timer)
      req.removeListener("data", onData)
      req.removeListener("end", onEnd)
      req.removeListener("error", onError)
    }
    const fail = (error) => {
      if (settled) return
      settled = true
      cleanup()
      // 超时/超大数据不再让旧连接无限上传；响应结束后由中间件关闭套接字。
      if (error?.status === 408 || error?.status === 413 || error?.closeConnection) {
        error.closeConnection = true
        const swallowLateError = () => {}
        req.once("error", swallowLateError)
        req.once("close", () => req.removeListener("error", swallowLateError))
      }
      reject(error)
    }
    const onAbort = () => fail(abortedError())
    signal?.addEventListener("abort", onAbort, { once: true })
    timer = setTimeout(() => {
      const error = new Error("请求上传超时，请重试。")
      error.status = 408
      error.expose = true
      fail(error)
    }, timeoutMs)
    req.on("data", onData)
    req.on("end", onEnd)
    req.on("error", onError)
  })
}

function terminateChild(child) {
  if (!child.pid) return
  const signalGroup = (signal) => {
    if (process.platform === "win32") {
      child.kill(signal)
      return
    }
    try {
      process.kill(-child.pid, signal)
    } catch {
      try { child.kill(signal) } catch {}
    }
  }
  signalGroup("SIGTERM")
  setTimeout(() => signalGroup("SIGKILL"), 1500).unref()
}

function runCodex(prompt, options = {}) {
  return new Promise((resolve, reject) => {
    const { signal, deadline = Date.now() + TUTOR_REQUEST_BUDGET_MS } = options
    if (signal?.aborted) return reject(abortedError())
    const budget = remainingMs(deadline)
    if (budget <= 0) return reject(new Error("导师请求超时"))

    const args = [
      "exec",
      "--ephemeral",
      "--json",
      "--color", "never",
      "-s", "read-only",
      "-C", REPO_ROOT,
    ]
    if (process.env.CODEX_TUTOR_MODEL) args.push("-m", process.env.CODEX_TUTOR_MODEL)
    args.push("-")

    const child = spawn(codexBinary(), args, {
      cwd: REPO_ROOT,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    })

    let stdout = ""
    let stderr = ""
    let settled = false
    let timer = null
    const onAbort = () => {
      terminateChild(child)
      finish(() => reject(abortedError()))
    }
    const finish = (fn) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
      fn()
    }
    timer = setTimeout(() => {
      terminateChild(child)
      finish(() => reject(new Error("导师请求超时")))
    }, Math.min(TUTOR_TIMEOUT_MS, budget))
    signal?.addEventListener("abort", onAbort, { once: true })

    child.stdout.on("data", (chunk) => {
      if (stdout.length < 2_000_000) stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
    child.stdin.on("error", () => {})
    child.on("error", (error) => finish(() => reject(error)))
    child.on("close", (code) => {
      if (settled) return
      if (code !== 0) {
        return finish(() => reject(new Error(stderr.trim().split("\n").slice(-4).join("\n") || `Codex 退出码 ${code}`)))
      }
      let text = ""
      for (const line of stdout.split("\n")) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          if (event.type === "item.completed" && event.item?.type === "agent_message") {
            text = event.item.text || text
          }
        } catch {
          // Ignore non-JSON diagnostics; stdout is normally JSONL.
        }
      }
      finish(() => resolve(text.trim()))
    })

    child.stdin.end(prompt)
  })
}

async function runValidatedTutorReply(prompt, mode, quizPlan, allowFinalSummary, options) {
  let text = await runCodex(prompt, options)
  let violation = validateTutorReply(text, mode, quizPlan, { allowFinalSummary })
  if (!violation) return text

  if (options?.signal?.aborted) throw abortedError()
  const deadline = options?.deadline ?? Date.now() + TUTOR_REQUEST_BUDGET_MS
  if (remainingMs(deadline) < MIN_REPAIR_BUDGET_MS) {
    throw httpError(504, "导师回复需要返工，但本次请求的时间预算已经不够；请重试。")
  }

  // 模型偶尔会一次抛出多题或选项。只返工一次；仍不合格就明确失败，不把坏回复交给学生。
  const repairPrompt = `${prompt}

# 硬性返工
你上一版违反了输出约束：${violation}
请重写这一条回复：保留必要的反馈，但只留一个待答问题；不要标题、表格、选项或整张试卷。`
  text = await runCodex(repairPrompt, options)
  violation = validateTutorReply(text, mode, quizPlan, { allowFinalSummary })
  if (violation) throw httpError(502, `导师回复不符合“一次一题”：${violation}请重试。`)
  return text
}

function tutorMiddleware() {
  return async (req, res) => {
    const path = (req.url || "/").split("?")[0]
    const remote = req.socket.remoteAddress || ""
    const loopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1"
    if (!loopback) {
      return json(res, 403, { error: "导师只接受本机请求。" })
    }
    if (!isLoopbackHost(req.headers.host)) {
      return json(res, 403, { error: "导师只接受 localhost / 127.0.0.1 / [::1] 回环地址。" })
    }
    if (req.headers.origin) {
      if (!originMatchesRequest(req.headers.origin, req.headers.host, Boolean(req.socket.encrypted))) {
        return json(res, 403, { error: "导师拒绝了非法来源。" })
      }
    }

    if (req.method === "GET" && (path === "/health" || path === "/health/")) {
      return json(res, 200, checkCodex())
    }
    const isAssessment = path === "/assess" || path === "/assess/"
    if (req.method !== "POST" || (path !== "/" && path !== "" && !isAssessment)) {
      return json(res, 404, { error: "Not found" })
    }
    if (activeRequests >= MAX_CONCURRENT) {
      return json(res, 429, { error: "导师正在处理别的消息，请稍后再试。" })
    }

    const controller = new AbortController()
    const onClientAbort = () => controller.abort()
    const onResponseClose = () => {
      if (!res.writableEnded) controller.abort()
    }
    req.once("aborted", onClientAbort)
    res.once("close", onResponseClose)

    activeRequests += 1
    try {
      const deadline = Date.now() + TUTOR_REQUEST_BUDGET_MS
      const input = await readBody(req, controller.signal)
      const health = checkCodex()
      if (!health.available) {
        return json(res, 503, { error: "本机没有找到 Codex CLI。请先在终端确认 `codex --version` 可用。" })
      }

      const contract = lessonContract(input?.lesson?.id)
      if (!contract) {
        return json(res, 400, { error: "课程节点不存在，无法判定或提问。" })
      }
      const authoritativeInput = withAuthoritativeContract(input, contract)

      if (isAssessment) {
        const requestError = assessmentRequestError(input, {
          requireArtifact: true,
          practice: contract.lesson.practice,
        })
        if (requestError) {
          return json(res, requestError.includes("读到收束") ? 409 : 400, { error: requestError })
        }
        const started = Date.now()
        const text = await runCodex(buildAssessmentPrompt(authoritativeInput), {
          signal: controller.signal,
          deadline,
        })
        if (!text) return json(res, 502, { error: "导师没有返回判定，请重试。" })
        let assessment
        try {
          assessment = guardAssessment(parseAssessment(text), input.history, {
            requiredStudentTurns: contract.requiredStudentTurns,
            checkpoint: contract.checkpoint,
            referenceTexts: input.referenceTexts,
            lessonText: input.context?.lessonText,
            artifact: input.artifact,
            requireArtifact: true,
          })
        } catch (error) {
          const parseError = new Error(error instanceof Error ? error.message : "判定结果格式错误")
          parseError.status = 502
          parseError.expose = true
          throw parseError
        }
        return json(res, 200, { assessment, elapsedMs: Date.now() - started })
      }

      if (typeof input?.message !== "string" || !input.message.trim()) {
        return json(res, 400, { error: "消息不能为空。" })
      }
      if (input.message.length > MAX_MESSAGE) {
        return json(res, 413, { error: "这条消息太长，请拆成更小的问题。" })
      }
      if (!["ask", "feynman", "quiz"].includes(input.mode)) {
        return json(res, 400, { error: "未知的导师模式。" })
      }
      if (input.mode === "quiz" && input.quizPlan != null && !["quick", "unit", "full", "stage"].includes(input.quizPlan)) {
        return json(res, 400, { error: "未知的考问节奏。" })
      }

      const started = Date.now()
      const text = await runValidatedTutorReply(
        buildTutorPrompt(authoritativeInput),
        input.mode,
        input.quizPlan ?? "quick",
        isQuizWrapUp(authoritativeInput),
        { signal: controller.signal, deadline },
      )
      if (!text) return json(res, 502, { error: "导师没有返回文字，请重试。" })
      return json(res, 200, { text, elapsedMs: Date.now() - started })
    } catch (error) {
      const message = error instanceof Error ? error.message : "导师请求失败"
      const explicitClientError = error?.status === 400 || error?.status === 409 || error?.status === 413
      const status = typeof error?.status === "number"
        ? error.status
        : message.includes("超时")
          ? 504
          : 502
      const safeMessage = error?.expose === true || explicitClientError || message.includes("Codex") || message.includes("超时")
      if (error?.closeConnection && !req.destroyed) {
        res.once("finish", () => {
          if (!req.destroyed) req.socket?.destroy()
        })
      }
      return json(res, status, { error: safeMessage ? message : "导师请求失败，请重试。" })
    } finally {
      req.removeListener("aborted", onClientAbort)
      res.removeListener("close", onResponseClose)
      activeRequests = Math.max(0, activeRequests - 1)
    }
  }
}

/** Vite 开发/预览服务器中的本机导师桥；不进入静态构建产物。 */
export function tutorPlugin() {
  const middleware = tutorMiddleware()
  return {
    name: "alpha-gomoku-local-tutor",
    configureServer(server) {
      server.middlewares.use("/api/tutor", middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/tutor", middleware)
    },
  }
}
