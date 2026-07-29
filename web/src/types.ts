/**
 * Type contracts mirroring PLAN.md §5 (server REST/WS) and §6 (run-dir JSON).
 * Field names match the JSON produced by alphagomoku/storage.py exactly.
 */

// ------------------------------------------------------------------ status

/** status.json full snapshot (PLAN §6), plus server-injected fields (§5). */
export interface Status {
  state: string // "idle" | "running" | "paused" | "stopped" (trainer-defined)
  iteration: number
  games_done: number
  samples: number
  best_iteration: number
  heartbeat: number // unix seconds
  iteration_phase: string // "selfplay" | "train" | "arena" | ...
  progress: number // 0..1 within the current phase
  /** GET /api/status additions */
  trainer_alive?: boolean
  config?: TrainConfig
}

/** Training config snapshot (PLAN §4.1); all fields optional on the wire. */
export interface TrainConfig {
  board_size?: number
  win_len?: number
  net_channels?: number
  net_res_blocks?: number
  mcts_simulations?: number
  games_per_iteration?: number
  parallel_games?: number
  batch_size?: number
  train_steps?: number
  lr?: number
  buffer_size?: number
  min_buffer?: number
  arena_enabled?: boolean
  arena_every?: number
  arena_games?: number
  arena_simulations?: number
  promote_threshold?: number
  [key: string]: unknown
}

// ----------------------------------------------------------------- metrics

export interface ArenaResult {
  wins_a: number
  wins_b: number
  draws: number
  win_rate_a: number
  promoted?: boolean
}

/** One line of metrics.jsonl (PLAN §6). */
export interface MetricsRow {
  iteration: number
  loss: number | null
  policy_loss: number | null
  value_loss: number | null
  policy_entropy: number | null
  games: number
  samples: number
  buffer: number
  lr: number
  sec_selfplay: number
  sec_train: number
  arena_vs_best: ArenaResult | null
  arena_vs_baseline: ArenaResult | null
  best_iteration: number
}

// ------------------------------------------------------------------- games

export interface GameMeta {
  opponent?: string | null
  black?: string
  white?: string
}

/** Summary row from GET /api/games (PLAN §5). */
export interface GameSummary {
  id: string
  kind: "selfplay" | "arena"
  iteration: number
  result: number // 1 black wins, -1 white wins, 0 draw
  moves: number // move count
  created_at: number
  meta: GameMeta
}

/** One move inside a game record (PLAN §6). */
export interface MoveRecord {
  n: number
  x: number
  y: number
  player: number // 1 | -1
  value: number // root value before the move, side-to-move perspective
  pi: number[] // N*N normalized visit distribution (training target)
  top: { action: number; prob: number; visits: number }[]
}

/** Full game JSON (PLAN §6). */
export interface GameRecord {
  id: string
  kind: "selfplay" | "arena"
  iteration: number
  board_size: number
  win_len: number
  created_at: number
  result: number
  first_player: number
  meta: GameMeta
  moves: MoveRecord[]
}

export interface GameListResponse {
  games: GameSummary[]
  next_cursor: string | null
}

// ------------------------------------------------------------- checkpoints

export interface CheckpointInfo {
  name: string
  size: number
  mtime: number
  meta?: Record<string, unknown>
}

// ----------------------------------------------------------------- events

export interface GameProgressData {
  slot: number
  iteration: number
  game_id: string
  board: number[] // flat N*N, 0 empty / 1 black / -1 white
  last_move: number | null // action index
  move_count: number
  player_to_move: number
  pi_top5: { action: number; prob: number }[]
  value: number // root value, side-to-move perspective
}

export interface GameEndData {
  game_id: string
  kind?: "selfplay" | "arena"
  iteration: number
  result: number
  moves: number
  first_player: number
}

export interface TrainEndData {
  iteration: number
  loss: number
  policy_loss: number
  value_loss: number
  buffer: number
}

export interface ArenaEndData {
  iteration: number
  opponent: "best" | "baseline"
  win_rate: number
  wins: number
  losses: number
  draws: number
  promoted: boolean
}

export interface LogData {
  level: string
  message: string
}

export type EventType =
  | "status"
  | "iteration_start"
  | "game_progress"
  | "game_end"
  | "train_end"
  | "arena_end"
  | "log"

/** One line of events.jsonl / one WS frame (PLAN §6). */
export interface WSEvent<T = unknown> {
  ts: number
  type: EventType
  data: T
}

export type ProgressEvent = WSEvent<GameProgressData>

// -------------------------------------------------------------------- play

/** AI candidate move with its policy mass (top-k of an AI move). */
export interface AiMoveStats {
  action?: number
  x: number
  y: number
  prob: number
  visits?: number
}

/** One move in a play session; AI moves carry the search root value. */
export interface PlayMove {
  n: number
  x: number
  y: number
  player: number
  value?: number
}

/**
 * Play session snapshot (PLAN §5: POST /api/play/new, GET /api/play/{sid},
 * POST move/step responses).
 */
export interface PlaySession {
  sid: string
  board_size: number
  board: number[] // flat N*N
  human_color: number // 1 black, -1 white, 0 = AI self-play
  current_player: number
  last_move: { x: number; y: number } | null
  move_count: number
  outcome: number | null // 1 / -1 / 0 once finished
  ai_top: AiMoveStats[] // top-k of the most recent AI move
  value: number // root value of the most recent AI move (its perspective)
  moves?: PlayMove[]
  checkpoint?: string
  simulations?: number
}
