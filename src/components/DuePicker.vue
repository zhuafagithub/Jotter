<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-vue-next'
import { formatDue, isOverdue } from '../utils/format'

const props = defineProps<{
  modelValue: number | null
  /** 已完成时弱化颜色 */
  done?: boolean
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: number | null): void }>()

const pad2 = (n: number): string => String(n).padStart(2, '0')

const open = ref(false)

/** 草稿：改动只进草稿，点「确定」才应用（需求 9） */
const draft = ref<Date | null>(null)
const viewY = ref(new Date().getFullYear())
const viewM = ref(new Date().getMonth()) // 0-11

function defaultDraft(): Date {
  const d = new Date()
  d.setHours(9, 0, 0, 0)
  return d
}

function syncView(): void {
  const d = draft.value ?? new Date()
  viewY.value = d.getFullYear()
  viewM.value = d.getMonth()
}

watch(open, (v) => {
  if (v) {
    draft.value = props.modelValue != null ? new Date(props.modelValue) : defaultDraft()
    syncView()
    void nextTick(scrollTimeCols)
  }
})

// ---------- 自绘日历 ----------
const weekLabels = ['一', '二', '三', '四', '五', '六', '日']
const monthLabel = computed(() => `${viewY.value}年${viewM.value + 1}月`)

interface Cell {
  key: string
  day: number
  inMonth: boolean
  date: Date
}

const cells = computed<Cell[]>(() => {
  const first = new Date(viewY.value, viewM.value, 1)
  const lead = (first.getDay() + 6) % 7 // 周一开头
  const start = new Date(viewY.value, viewM.value, 1 - lead)
  const out: Cell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    out.push({ key: d.toDateString(), day: d.getDate(), inMonth: d.getMonth() === viewM.value, date: d })
  }
  return out
})

function prevMonth(): void {
  if (viewM.value === 0) {
    viewM.value = 11
    viewY.value--
  } else viewM.value--
}

function nextMonth(): void {
  if (viewM.value === 11) {
    viewM.value = 0
    viewY.value++
  } else viewM.value++
}

function isToday(c: Cell): boolean {
  return c.date.toDateString() === new Date().toDateString()
}

function isSelected(c: Cell): boolean {
  return draft.value?.toDateString() === c.key
}

/** 点选日期：只更新草稿，保留已选时间 */
function pickDate(c: Cell): void {
  const base = draft.value ?? defaultDraft()
  const d = new Date(c.date)
  d.setHours(base.getHours(), base.getMinutes(), 0, 0)
  draft.value = d
  if (!c.inMonth) {
    viewY.value = c.date.getFullYear()
    viewM.value = c.date.getMonth()
  }
}

// ---------- 时 / 分滚动列 ----------
const hourCol = ref<HTMLElement | null>(null)
const minCol = ref<HTMLElement | null>(null)
const ITEM_H = 28

const hours = Array.from({ length: 24 }, (_, i) => i)
const minutes = Array.from({ length: 60 }, (_, i) => i)

function scrollTimeCols(): void {
  const d = draft.value
  if (!d) return
  if (hourCol.value) hourCol.value.scrollTop = Math.max(0, d.getHours() * ITEM_H - ITEM_H * 2.5)
  if (minCol.value) minCol.value.scrollTop = Math.max(0, d.getMinutes() * ITEM_H - ITEM_H * 2.5)
}

function setHour(h: number): void {
  const base = draft.value ?? defaultDraft()
  const d = new Date(base)
  d.setHours(h)
  draft.value = d
}

function setMinute(m: number): void {
  const base = draft.value ?? defaultDraft()
  const d = new Date(base)
  d.setMinutes(m)
  draft.value = d
}

// ---------- 快捷项：实时同步日历与时间列 ----------
function quick(kind: 'inHour' | 'today' | 'tomorrow' | 'nextWeek'): void {
  const base = draft.value ?? defaultDraft()
  const d = new Date()
  if (kind === 'inHour') {
    d.setMinutes(d.getMinutes() + 60)
  } else {
    if (kind === 'tomorrow') d.setDate(d.getDate() + 1)
    if (kind === 'nextWeek') d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
    if (kind === 'today' && base.getTime() < d.getTime()) {
      // 今天但草稿时间已过：顺延到 1 小时后
      d.setMinutes(d.getMinutes() + 60)
    } else {
      d.setHours(base.getHours(), base.getMinutes(), 0, 0)
    }
  }
  draft.value = d
  syncView()
  void nextTick(scrollTimeCols)
}

// ---------- 应用 / 清除 ----------
function confirm(): void {
  if (!draft.value) return
  emit('update:modelValue', draft.value.getTime())
  open.value = false
}

function clearDue(): void {
  emit('update:modelValue', null)
  open.value = false
}

const display = computed(() => (props.modelValue != null ? formatDue(props.modelValue) : '设置时间'))
const overdue = computed(
  () => !props.done && props.modelValue != null && isOverdue(props.modelValue),
)
</script>

<template>
  <div class="due-picker">
    <button
      class="due-trigger"
      :class="{ set: modelValue != null, overdue }"
      @click.stop="open = !open"
    >
      <CalendarDays :size="14" />
      <span class="due-text">{{ display }}</span>
      <X v-if="modelValue != null" :size="12" class="due-x" @click.stop="clearDue" />
    </button>

    <Transition name="pop">
      <div v-if="open" class="due-pop" @click.stop>
        <div class="quick-row">
          <button class="quick-btn" @click="quick('inHour')">一小时后</button>
          <button class="quick-btn" @click="quick('today')">今天</button>
          <button class="quick-btn" @click="quick('tomorrow')">明天</button>
          <button class="quick-btn" @click="quick('nextWeek')">下周一</button>
        </div>

        <div class="cal-head">
          <span class="cal-title">{{ monthLabel }}</span>
          <div class="cal-nav">
            <button class="cal-nav-btn" data-tip="上一月" data-tip-dir="bottom" @click="prevMonth">
              <ChevronLeft :size="14" />
            </button>
            <button class="cal-nav-btn" data-tip="下一月" data-tip-dir="bottom" @click="nextMonth">
              <ChevronRight :size="14" />
            </button>
          </div>
        </div>

        <div class="cal-grid">
          <span v-for="w in weekLabels" :key="w" class="cal-week">{{ w }}</span>
          <button
            v-for="c in cells"
            :key="c.key"
            class="cal-day"
            :class="{ out: !c.inMonth, today: isToday(c), selected: isSelected(c) }"
            @click="pickDate(c)"
          >
            {{ c.day }}
          </button>
        </div>

        <div class="time-row">
          <div ref="hourCol" class="time-col">
            <button
              v-for="h in hours"
              :key="h"
              class="time-item"
              :class="{ on: draft?.getHours() === h }"
              @click="setHour(h)"
            >
              {{ pad2(h) }} 时
            </button>
          </div>
          <div ref="minCol" class="time-col">
            <button
              v-for="m in minutes"
              :key="m"
              class="time-item"
              :class="{ on: draft?.getMinutes() === m }"
              @click="setMinute(m)"
            >
              {{ pad2(m) }} 分
            </button>
          </div>
        </div>

        <div class="pop-footer">
          <button v-if="modelValue != null" class="footer-btn ghost" @click="clearDue">清除时间</button>
          <span class="footer-space" />
          <button class="footer-btn plain" @click="open = false">取消</button>
          <button class="footer-btn primary" @click="confirm">确定</button>
        </div>
      </div>
    </Transition>
    <div v-if="open" class="due-mask" @click="open = false" />
  </div>
</template>

<style scoped>
.due-picker {
  position: relative;
}

.due-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 8px;
  background: var(--bg-card);
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}
.due-trigger:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.due-trigger.set {
  color: var(--accent);
  border-color: var(--accent-soft);
  background: var(--accent-soft);
}
.due-trigger.overdue {
  color: var(--red);
  border-color: rgba(255, 77, 79, 0.3);
  background: rgba(255, 77, 79, 0.08);
}

.due-text {
  white-space: nowrap;
}

.due-x {
  opacity: 0.6;
  border-radius: 3px;
  transition: opacity 0.15s ease;
}
.due-x:hover {
  opacity: 1;
}

.due-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.due-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 292px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-pop);
  padding: 12px;
  z-index: 41;
}

.quick-row {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.quick-btn {
  flex: 1;
  font-size: 12px;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 0;
  transition:
    border-color 0.15s ease,
    color 0.15s ease,
    background 0.15s ease;
}
.quick-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

/* ---------- 自绘日历 ---------- */
.cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.cal-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.cal-nav {
  display: flex;
  gap: 2px;
}
.cal-nav-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.cal-nav-btn:hover {
  background: var(--hover);
  color: var(--text);
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.cal-week {
  font-size: 11px;
  color: var(--text-placeholder);
  text-align: center;
  line-height: 24px;
}
.cal-day {
  position: relative;
  height: 30px;
  border-radius: 7px;
  font-size: 12.5px;
  color: var(--text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}
.cal-day:hover {
  background: var(--hover);
}
.cal-day.out {
  color: var(--text-placeholder);
  opacity: 0.6;
}
.cal-day.today::after {
  content: '';
  position: absolute;
  bottom: 3px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}
.cal-day.selected {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
}
.cal-day.selected.today::after {
  background: #fff;
}

/* ---------- 时/分滚动列 ---------- */
.time-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.time-col {
  flex: 1;
  height: 140px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  padding: 2px;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}
.time-col::-webkit-scrollbar {
  width: 5px;
}
.time-col::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 3px;
}
.time-item {
  display: block;
  width: 100%;
  height: 26px;
  line-height: 26px;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  border-radius: 5px;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}
.time-item:hover {
  background: var(--hover);
  color: var(--text);
}
.time-item.on {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.pop-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.footer-space {
  flex: 1;
}
.footer-btn {
  font-size: 12px;
  border-radius: 6px;
  padding: 5px 14px;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.footer-btn.plain {
  color: var(--text-secondary);
}
.footer-btn.plain:hover {
  color: var(--text);
  background: var(--hover);
}
.footer-btn.ghost {
  color: var(--text-secondary);
}
.footer-btn.ghost:hover {
  color: var(--red);
  background: rgba(255, 77, 79, 0.08);
}
.footer-btn.primary {
  background: var(--accent);
  color: #fff;
}
.footer-btn.primary:hover {
  background: var(--accent-hover);
}
</style>
