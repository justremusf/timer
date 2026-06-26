import {
  ChevronDown,
  ChevronRight,
  Clock3,
  Hourglass,
  Maximize,
  Menu,
  MoonStar,
  Plus,
  Settings,
  Trash2,
  Timer as StopwatchIcon,
} from 'lucide-react'
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'

type Mode = 'clock' | 'day' | 'timer' | 'stopwatch'
type Panel = Exclude<Mode, 'clock'> | 'settings' | null
type HourFormat = '12h' | '24h'

type TimerPreset = {
  id: string
  label: string
  minutes: number
  custom: boolean
}

type UserSettings = {
  bedtime: string
  hourFormat: HourFormat
  soundEnabled: boolean
  lastMode: Mode
  lastTimerMinutes: number
  customPresets: TimerPreset[]
}

type TimeTheme = {
  appClass: string
  style: CSSProperties
}

type DisplayCard = {
  value: string
  unit: string
}

type Display = {
  ariaLabel: string
  cards: DisplayCard[]
  subtitle: string
  title: string
}

const DEFAULT_PRESETS: TimerPreset[] = [
  { id: 'default-25', label: '25 min', minutes: 25, custom: false },
  { id: 'default-50', label: '50 min', minutes: 50, custom: false },
  { id: 'default-90', label: '90 min', minutes: 90, custom: false },
  { id: 'default-240', label: '240 min', minutes: 240, custom: false },
]

const DEFAULT_SETTINGS: UserSettings = {
  bedtime: '22:00',
  hourFormat: '12h',
  soundEnabled: true,
  lastMode: 'day',
  lastTimerMinutes: 240,
  customPresets: [],
}

const STORAGE_KEY = 'exact-bedtime-timer-settings-v1'
const DOCK_IDLE_MS = 5200

const modeItems: Array<{
  mode: Mode
  label: string
  icon: typeof Hourglass
}> = [
  { mode: 'clock', label: 'Clock', icon: Clock3 },
  { mode: 'timer', label: 'Timer', icon: Hourglass },
  { mode: 'day', label: 'Day', icon: MoonStar },
  { mode: 'stopwatch', label: 'Stopwatch', icon: StopwatchIcon },
]

function isMode(value: unknown): value is Mode {
  return (
    value === 'clock' ||
    value === 'day' ||
    value === 'timer' ||
    value === 'stopwatch'
  )
}

function loadSettings(): UserSettings {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) {
      return DEFAULT_SETTINGS
    }

    const parsed = JSON.parse(saved) as Partial<UserSettings> & {
      lastMode?: unknown
    }

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      lastMode: isMode(parsed.lastMode) ? parsed.lastMode : 'day',
      customPresets: Array.isArray(parsed.customPresets)
        ? parsed.customPresets
        : [],
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function parseTimeParts(time: string) {
  const [hours = '22', minutes = '00'] = time.split(':')
  return {
    hours: Number(hours),
    minutes: Number(minutes),
  }
}

function getBedtimeTarget(now: Date, bedtime: string) {
  const { hours, minutes } = parseTimeParts(bedtime)
  const target = new Date(now)
  target.setHours(hours, minutes, 0, 0)

  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }

  return target
}

function formatTargetTime(time: string) {
  const { hours, minutes } = parseTimeParts(time)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function formatClockTime(date: Date, hourFormat: HourFormat) {
  if (hourFormat === '24h') {
    return {
      main: `${String(date.getHours()).padStart(2, '0')}:${String(
        date.getMinutes(),
      ).padStart(2, '0')}`,
      suffix: '',
    }
  }

  const suffix = date.getHours() >= 12 ? 'PM' : 'AM'
  const hour12 = date.getHours() % 12 || 12
  return {
    main: `${hour12}:${String(date.getMinutes()).padStart(2, '0')}`,
    suffix,
  }
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const totalMinutes = Math.floor(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const remainingSeconds = seconds % 60

  return {
    hours,
    minutes,
    seconds: remainingSeconds,
  }
}

function durationCards(totalSeconds: number): DisplayCard[] {
  const duration = formatDuration(totalSeconds)
  return [
    { value: String(duration.hours), unit: 'h' },
    { value: String(duration.minutes).padStart(2, '0'), unit: 'm' },
    { value: String(duration.seconds).padStart(2, '0'), unit: 's' },
  ]
}

function getDayProgress(now: Date, bedtime: string) {
  const { hours, minutes } = parseTimeParts(bedtime)
  const endSeconds = Math.max(1, (hours * 60 + minutes) * 60)
  const currentSeconds =
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
  return Math.min(100, Math.max(0, (currentSeconds / endSeconds) * 100))
}

function makeCustomPreset(minutes: number): TimerPreset {
  return {
    id: `custom-${Date.now()}`,
    label: `${minutes} min`,
    minutes,
    custom: true,
  }
}

function getTimeTheme(now: Date): TimeTheme {
  const hour = now.getHours() + now.getMinutes() / 60

  if (hour >= 5 && hour < 11) {
    return {
      appClass: 'time-morning',
      style: {
        '--accent': '#ffd35b',
        '--accent-2': '#fff2a6',
        '--accent-rgb': '255, 211, 91',
        '--sky-a': '#1b1710',
        '--sky-b': '#091014',
        '--horizon-a': '#fff08d',
        '--horizon-b': '#f5a83c',
        '--horizon-c': '#7db6ff',
      } as CSSProperties,
    }
  }

  if (hour >= 11 && hour < 17) {
    return {
      appClass: 'time-afternoon',
      style: {
        '--accent': '#e8aa42',
        '--accent-2': '#ffd27a',
        '--accent-rgb': '232, 170, 66',
        '--sky-a': '#111518',
        '--sky-b': '#06090d',
        '--horizon-a': '#fee8a1',
        '--horizon-b': '#e29c3b',
        '--horizon-c': '#5a86c9',
      } as CSSProperties,
    }
  }

  if (hour >= 17 && hour < 21) {
    return {
      appClass: 'time-evening',
      style: {
        '--accent': '#8eb7ff',
        '--accent-2': '#c5dbff',
        '--accent-rgb': '142, 183, 255',
        '--sky-a': '#101827',
        '--sky-b': '#05070d',
        '--horizon-a': '#f4ae65',
        '--horizon-b': '#6a89dc',
        '--horizon-c': '#b9d5ff',
      } as CSSProperties,
    }
  }

  return {
    appClass: 'time-night',
    style: {
      '--accent': '#b9d5ff',
      '--accent-2': '#e2ecff',
      '--accent-rgb': '185, 213, 255',
      '--sky-a': '#0b1220',
      '--sky-b': '#030509',
      '--horizon-a': '#354b78',
      '--horizon-b': '#9fbdec',
      '--horizon-c': '#eef5ff',
    } as CSSProperties,
  }
}

function App() {
  const [settings, setSettings] = useState<UserSettings>(loadSettings)
  const [activeMode, setActiveMode] = useState<Mode>(settings.lastMode)
  const [activePanel, setActivePanel] = useState<Panel>(null)
  const [dockOpen, setDockOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [timerRemaining, setTimerRemaining] = useState(
    settings.lastTimerMinutes * 60,
  )
  const [timerEndAt, setTimerEndAt] = useState<number | null>(null)
  const [stopwatchElapsed, setStopwatchElapsed] = useState(0)
  const [stopwatchStartedAt, setStopwatchStartedAt] = useState<number | null>(
    null,
  )
  const [customMinutes, setCustomMinutes] = useState(
    String(settings.lastTimerMinutes),
  )
  const controlsRef = useRef<HTMLDivElement>(null)
  const collapseTimerRef = useRef<number | null>(null)

  const allPresets = useMemo(
    () => [...DEFAULT_PRESETS, ...settings.customPresets],
    [settings.customPresets],
  )

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    setSettings((current) => ({ ...current, lastMode: activeMode }))
  }, [activeMode])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (timerEndAt) {
        const remaining = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000))
        setTimerRemaining(remaining)
        if (remaining <= 0) {
          setTimerEndAt(null)
        }
      }

      if (stopwatchStartedAt) {
        setStopwatchElapsed(Math.floor((Date.now() - stopwatchStartedAt) / 1000))
      }
    }, 250)

    return () => window.clearInterval(interval)
  }, [stopwatchStartedAt, timerEndAt])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        controlsRef.current &&
        !controlsRef.current.contains(event.target as Node)
      ) {
        closeControls()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  useEffect(() => {
    if (!dockOpen && !activePanel) {
      return
    }

    if (collapseTimerRef.current) {
      window.clearTimeout(collapseTimerRef.current)
    }

    collapseTimerRef.current = window.setTimeout(() => {
      closeControls()
    }, DOCK_IDLE_MS)

    return () => {
      if (collapseTimerRef.current) {
        window.clearTimeout(collapseTimerRef.current)
      }
    }
  }, [activePanel, dockOpen])

  const bedtimeTarget = getBedtimeTarget(now, settings.bedtime)
  const bedtimeLabel = formatTargetTime(settings.bedtime)
  const daySecondsLeft = Math.ceil(
    (bedtimeTarget.getTime() - now.getTime()) / 1000,
  )
  const dayProgress = getDayProgress(now, settings.bedtime)
  const railTime = formatClockTime(now, settings.hourFormat)
  const currentTimeLabel = `${railTime.main}${railTime.suffix ? ` ${railTime.suffix}` : ''}`
  const timeTheme = getTimeTheme(now)
  const display = getDisplay(activeMode, {
    bedtimeLabel,
    daySecondsLeft,
    hourFormat: settings.hourFormat,
    now,
    stopwatchElapsed,
    timerRemaining,
  })

  function closeControls() {
    setActivePanel(null)
    setDockOpen(false)
  }

  function updateSettings(update: Partial<UserSettings>) {
    setSettings((current) => ({ ...current, ...update }))
  }

  function chooseMode(mode: Mode) {
    setActiveMode(mode)
    setActivePanel(mode === 'clock' ? null : mode)
    setDockOpen(true)
  }

  function selectTimerMinutes(minutes: number) {
    setTimerEndAt(null)
    setTimerRemaining(minutes * 60)
    setCustomMinutes(String(minutes))
    updateSettings({ lastTimerMinutes: minutes })
  }

  function startPauseTimer() {
    if (timerEndAt) {
      setTimerEndAt(null)
      setTimerRemaining(Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000)))
      return
    }

    if (timerRemaining <= 0) {
      setTimerRemaining(settings.lastTimerMinutes * 60)
      setTimerEndAt(Date.now() + settings.lastTimerMinutes * 60 * 1000)
      return
    }

    setTimerEndAt(Date.now() + timerRemaining * 1000)
  }

  function resetTimer() {
    setTimerEndAt(null)
    setTimerRemaining(settings.lastTimerMinutes * 60)
  }

  function saveCustomPreset() {
    const minutes = Math.round(Number(customMinutes))
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
      return
    }

    const alreadySaved = allPresets.some((preset) => preset.minutes === minutes)
    selectTimerMinutes(minutes)

    if (!alreadySaved) {
      updateSettings({
        customPresets: [...settings.customPresets, makeCustomPreset(minutes)],
      })
    }
  }

  function deleteCustomPreset(id: string) {
    updateSettings({
      customPresets: settings.customPresets.filter((preset) => preset.id !== id),
    })
  }

  function startPauseStopwatch() {
    if (stopwatchStartedAt) {
      setStopwatchStartedAt(null)
      return
    }

    setStopwatchStartedAt(Date.now() - stopwatchElapsed * 1000)
  }

  function resetStopwatch() {
    setStopwatchStartedAt(null)
    setStopwatchElapsed(0)
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }

      await document.documentElement.requestFullscreen()
    } catch {
      // Fullscreen can be blocked by browser policy or automation contexts.
    }
  }

  return (
    <main
      className={`timer-app ${timeTheme.appClass}`}
      style={timeTheme.style}
    >
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <section className="flip-stage" aria-label={display.ariaLabel}>
        {display.cards.map((card) => (
          <FlipCard key={card.unit} unit={card.unit} value={card.value} />
        ))}
      </section>

      <LiquidRail
        bedtimeLabel={bedtimeLabel}
        currentTimeLabel={currentTimeLabel}
        progress={dayProgress}
      />

      <div
        className="controls-layer"
        ref={controlsRef}
      >
        {activePanel && (
          <ControlPanel
            activePanel={activePanel}
            allPresets={allPresets}
            customMinutes={customMinutes}
            deleteCustomPreset={deleteCustomPreset}
            resetStopwatch={resetStopwatch}
            resetTimer={resetTimer}
            saveCustomPreset={saveCustomPreset}
            selectTimerMinutes={selectTimerMinutes}
            setCustomMinutes={setCustomMinutes}
            settings={settings}
            startPauseStopwatch={startPauseStopwatch}
            startPauseTimer={startPauseTimer}
            stopwatchRunning={Boolean(stopwatchStartedAt)}
            timerRunning={Boolean(timerEndAt)}
            updateSettings={updateSettings}
          />
        )}

        <Dock
          activeMode={activeMode}
          activePanel={activePanel}
          chooseMode={chooseMode}
          dockOpen={dockOpen}
          setActivePanel={setActivePanel}
          setDockOpen={setDockOpen}
          toggleFullscreen={toggleFullscreen}
        />
      </div>
    </main>
  )
}

function getDisplay(
  activeMode: Mode,
  data: {
    bedtimeLabel: string
    daySecondsLeft: number
    hourFormat: HourFormat
    now: Date
    stopwatchElapsed: number
    timerRemaining: number
  },
): Display {
  if (activeMode === 'clock') {
    const hour =
      data.hourFormat === '24h'
        ? data.now.getHours()
        : data.now.getHours() % 12 || 12
    const minute = data.now.getMinutes()
    const second = data.now.getSeconds()
    const suffix = data.now.getHours() >= 12 ? 'PM' : 'AM'
    const label =
      data.hourFormat === '24h'
        ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
        : `${hour}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')} ${suffix}`

    return {
      ariaLabel: `Current time ${label}`,
      cards: [
        {
          value:
            data.hourFormat === '24h'
              ? String(hour).padStart(2, '0')
              : String(hour),
          unit: 'h',
        },
        { value: String(minute).padStart(2, '0'), unit: 'm' },
        { value: String(second).padStart(2, '0'), unit: 's' },
      ],
      subtitle: '',
      title: 'Clock',
    }
  }

  if (activeMode === 'timer') {
    const duration = formatDuration(data.timerRemaining)
    return {
      ariaLabel: `Timer ${duration.hours} hours ${duration.minutes} minutes ${duration.seconds} seconds`,
      cards: durationCards(data.timerRemaining),
      subtitle: 'preset countdown',
      title: 'Timer',
    }
  }

  if (activeMode === 'stopwatch') {
    const duration = formatDuration(data.stopwatchElapsed)
    return {
      ariaLabel: `Stopwatch ${duration.hours} hours ${duration.minutes} minutes ${duration.seconds} seconds`,
      cards: durationCards(data.stopwatchElapsed),
      subtitle: 'elapsed focus time',
      title: 'Stopwatch',
    }
  }

  const duration = formatDuration(data.daySecondsLeft)
  return {
    ariaLabel: `Day left ${duration.hours} hours ${duration.minutes} minutes ${duration.seconds} seconds until ${data.bedtimeLabel}`,
    cards: durationCards(data.daySecondsLeft),
    subtitle: `until ${data.bedtimeLabel}`,
    title: 'Day Left',
  }
}

function FlipCard({ unit, value }: DisplayCard) {
  return (
    <div className="flip-card">
      <span className="flip-value">{value}</span>
      <span className="flip-unit">{unit}</span>
    </div>
  )
}

function LiquidRail({
  bedtimeLabel,
  currentTimeLabel,
  progress,
}: {
  bedtimeLabel: string
  currentTimeLabel: string
  progress: number
}) {
  return (
    <section className="liquid-rail" aria-label="Day progress">
      <span className="rail-start">12:00 AM</span>
      <div className="rail-stage">
        <div className="rail-tube">
          <div className="rail-fill" style={{ width: `${progress}%` }} />
          <div className="rail-caustics" />
          <div
            className="rail-marker"
            style={{ left: `${progress}%` }}
          >
            <span>{currentTimeLabel}</span>
          </div>
          <div className="rail-end-dot" />
        </div>
      </div>
      <span className="rail-end">{bedtimeLabel}</span>
    </section>
  )
}

function Dock({
  activeMode,
  activePanel,
  chooseMode,
  dockOpen,
  setActivePanel,
  setDockOpen,
  toggleFullscreen,
}: {
  activeMode: Mode
  activePanel: Panel
  chooseMode: (mode: Mode) => void
  dockOpen: boolean
  setActivePanel: (panel: Panel) => void
  setDockOpen: (open: boolean) => void
  toggleFullscreen: () => void
}) {
  if (!dockOpen) {
    return (
      <button
        aria-label="Open timer controls"
        className="menu-orb"
        onClick={() => setDockOpen(true)}
        type="button"
      >
        <Settings size={26} strokeWidth={1.7} />
      </button>
    )
  }

  return (
    <nav className="dock expanded" aria-label="Timer controls">
      {modeItems.map(({ icon: Icon, label, mode }) => (
        <button
          aria-pressed={activeMode === mode}
          className={activeMode === mode ? 'active' : ''}
          key={mode}
          onClick={() => chooseMode(mode)}
          type="button"
        >
          <Icon size={30} strokeWidth={1.55} />
          <span>{label}</span>
        </button>
      ))}
      <button onClick={toggleFullscreen} type="button">
        <Maximize size={30} strokeWidth={1.55} />
        <span>Fullscreen</span>
      </button>
      <button
        aria-pressed={activePanel === 'settings'}
        className={activePanel === 'settings' ? 'active' : ''}
        onClick={() => setActivePanel('settings')}
        type="button"
      >
        <Menu size={30} strokeWidth={1.55} />
        <span>Settings</span>
      </button>
    </nav>
  )
}

function ControlPanel({
  activePanel,
  allPresets,
  customMinutes,
  deleteCustomPreset,
  resetStopwatch,
  resetTimer,
  saveCustomPreset,
  selectTimerMinutes,
  setCustomMinutes,
  settings,
  startPauseStopwatch,
  startPauseTimer,
  stopwatchRunning,
  timerRunning,
  updateSettings,
}: {
  activePanel: Panel
  allPresets: TimerPreset[]
  customMinutes: string
  deleteCustomPreset: (id: string) => void
  resetStopwatch: () => void
  resetTimer: () => void
  saveCustomPreset: () => void
  selectTimerMinutes: (minutes: number) => void
  setCustomMinutes: (value: string) => void
  settings: UserSettings
  startPauseStopwatch: () => void
  startPauseTimer: () => void
  stopwatchRunning: boolean
  timerRunning: boolean
  updateSettings: (update: Partial<UserSettings>) => void
}) {
  if (activePanel === 'timer') {
    return (
      <aside className="control-panel">
        <PanelHeader icon={Hourglass} title="Timer" />
        <div className="preset-grid">
          {allPresets.map((preset) => (
            <button
              className={
                preset.minutes === settings.lastTimerMinutes ? 'selected' : ''
              }
              key={preset.id}
              onClick={() => selectTimerMinutes(preset.minutes)}
              type="button"
            >
              {preset.label}
              {preset.custom && (
                <Trash2
                  aria-hidden="true"
                  focusable="false"
                  onClick={(event) => {
                    event.stopPropagation()
                    deleteCustomPreset(preset.id)
                  }}
                  size={15}
                />
              )}
            </button>
          ))}
        </div>
        <div className="save-row">
          <input
            aria-label="Custom timer minutes"
            inputMode="numeric"
            max="1440"
            min="1"
            onChange={(event) => setCustomMinutes(event.target.value)}
            type="number"
            value={customMinutes}
          />
          <button onClick={saveCustomPreset} type="button">
            <Plus size={16} /> Save
          </button>
        </div>
        <div className="action-row">
          <button className="primary-action" onClick={startPauseTimer} type="button">
            {timerRunning ? 'Pause' : 'Start'}
          </button>
          <button onClick={resetTimer} type="button">
            Reset
          </button>
        </div>
      </aside>
    )
  }

  if (activePanel === 'stopwatch') {
    return (
      <aside className="control-panel compact-panel">
        <PanelHeader icon={StopwatchIcon} title="Stopwatch" />
        <div className="action-row">
          <button
            className="primary-action"
            onClick={startPauseStopwatch}
            type="button"
          >
            {stopwatchRunning ? 'Pause' : 'Start'}
          </button>
          <button onClick={resetStopwatch} type="button">
            Reset
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="control-panel">
      <PanelHeader icon={MoonStar} title="Bedtime" />
      <label className="select-field">
        <span className="time-display">{formatTargetTime(settings.bedtime)}</span>
        <input
          aria-label="Bedtime"
          className="time-input"
          onChange={(event) => updateSettings({ bedtime: event.target.value })}
          type="time"
          value={settings.bedtime}
        />
        <ChevronDown size={19} />
      </label>
      <button className="panel-link" onClick={() => selectTimerMinutes(240)} type="button">
        <span>Timer</span>
        <strong>{settings.lastTimerMinutes} min</strong>
        <ChevronRight size={18} />
      </button>
      <SegmentedControl
        active={settings.hourFormat}
        first="12h"
        label="12/24h"
        second="24h"
        setActive={(hourFormat) => updateSettings({ hourFormat })}
      />
      <div className="toggle-row">
        <span>Sound</span>
        <button
          aria-pressed={settings.soundEnabled}
          className={settings.soundEnabled ? 'switch on' : 'switch'}
          onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
          type="button"
        >
          <span />
        </button>
      </div>
    </aside>
  )
}

function PanelHeader({
  icon: Icon,
  title,
}: {
  icon: typeof Hourglass
  title: string
}) {
  return (
    <header className="panel-header">
      <Icon size={20} strokeWidth={1.8} />
      <h2>{title}</h2>
    </header>
  )
}

function SegmentedControl({
  active,
  first,
  label,
  second,
  setActive,
}: {
  active: HourFormat
  first: HourFormat
  label: string
  second: HourFormat
  setActive: (value: HourFormat) => void
}) {
  return (
    <div className="segmented-row">
      <span>{label}</span>
      <div className="segmented-control">
        {[first, second].map((value) => (
          <button
            className={active === value ? 'selected' : ''}
            key={value}
            onClick={() => setActive(value)}
            type="button"
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  )
}

export default App
