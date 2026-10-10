<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  search,
  openSearchPanel,
  highlightSelectionMatches,
  searchKeymap,
} from '@codemirror/search'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, HighlightStyle } from '@codemirror/language'
import { yaml } from '@codemirror/lang-yaml'
import { parseDocument } from 'yaml'
import { tags } from '@lezer/highlight'
import { useEditorStore } from '../stores/editor'
import { useThemeStore } from '../stores/theme'

const container = ref<HTMLDivElement | null>(null)
const editorStore = useEditorStore()
const themeStore = useThemeStore()

let view: EditorView | null = null

/** 暗色专用高亮配色（defaultHighlightStyle 为浅色背景设计，暗色下发蓝发暗） */
const darkHighlight = HighlightStyle.define([
  { tag: tags.comment, color: '#5c6370', fontStyle: 'italic' },
  // YAML 键在 @lezer/yaml 中映射为 definition(propertyName) 复合标签
  { tag: tags.definition(tags.propertyName), color: '#82aaff' },
  { tag: [tags.propertyName, tags.attributeName], color: '#82aaff' },
  { tag: [tags.string, tags.attributeValue], color: '#c3e88d' },
  { tag: [tags.number, tags.integer, tags.float], color: '#f78c6c' },
  { tag: [tags.bool, tags.null, tags.atom], color: '#c792ea' },
  { tag: [tags.keyword, tags.modifier], color: '#89ddff' },
  { tag: [tags.operator, tags.punctuation, tags.separator], color: '#7f8c9b' },
  { tag: [tags.labelName, tags.meta], color: '#f0a94b' },
  { tag: [tags.variableName, tags.name], color: '#d5d5dc' },
  { tag: tags.url, color: '#82aaff', textDecoration: 'none' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
])

/** 搜索面板公共样式（亮色/暗色共用结构，仅颜色不同） */
const panelStyles = {
  '.cm-panels': { border: 'none' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-panel.cm-search': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 10px',
    fontFamily: 'var(--font-family)',
    fontSize: '12px',
  },
  '.cm-panel.cm-search br': { display: 'none' },
  '.cm-panel.cm-search input[type="text"], .cm-panel.cm-search input:not([type])': {
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid var(--border-strong)',
    fontSize: '12px',
    minWidth: '180px',
    outline: 'none',
  },
  '.cm-panel.cm-search input[type="text"]:focus, .cm-panel.cm-search input:not([type]):focus': {
    borderColor: 'var(--accent)',
  },
  '.cm-panel.cm-search button': {
    padding: '4px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border-strong)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
  },
  '.cm-panel.cm-search button:hover': {
    background: 'var(--accent-soft)',
    color: 'var(--accent)',
    borderColor: 'var(--accent)',
  },
  '.cm-panel.cm-search button[name="close"]': {
    position: 'static', // CM 默认绝对定位在角落，收回 flex 布局
    marginLeft: 'auto',
    fontSize: '17px',
    lineHeight: '1',
    padding: '5px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-strong)',
    background: 'var(--bg-elevated)',
  },
  '.cm-panel.cm-search button[name="close"]:hover': {
    color: 'var(--danger)',
    borderColor: 'var(--danger)',
    background: 'rgba(240,100,95,0.12)',
  },
  '.cm-panel.cm-search label': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  '.cm-panel.cm-search input[type="checkbox"]': {
    accentColor: 'var(--accent)',
    cursor: 'pointer',
  },
  '.cm-searchMatch': {
    backgroundColor: 'rgba(124,108,255,0.25)',
    outline: '1px solid rgba(124,108,255,0.4)',
  },
  '.cm-searchMatch-selected': { backgroundColor: 'rgba(124,108,255,0.45)' },
} as const

const darkTheme = EditorView.theme(
  {
    '&': { backgroundColor: '#15151a', color: '#d5d5dc', height: '100%', fontSize: '13px' },
    '.cm-gutters': { backgroundColor: '#15151a', color: '#55555f', border: 'none' },
    '.cm-activeLine': { backgroundColor: '#1e1e26' },
    '.cm-activeLineGutter': { backgroundColor: '#1e1e26', color: '#9a9aa6' },
    '.cm-cursor': { borderLeftColor: '#7c6cff' },
    '&.cm-focused': { outline: 'none' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(124,108,255,0.25)' },
    '.cm-panels': { backgroundColor: '#1b1b22', color: '#d5d5dc' },
    '.cm-panel.cm-search input[type="text"], .cm-panel.cm-search input:not([type])': {
      backgroundColor: '#15151a',
      color: '#d5d5dc',
    },
  },
  { dark: true },
)

const lightTheme = EditorView.theme(
  {
    '&': { height: '100%', fontSize: '13px' },
    '.cm-gutters': { border: 'none' },
    '.cm-panels': { backgroundColor: '#ffffff', color: '#1c1c24' },
    '.cm-panel.cm-search input[type="text"], .cm-panel.cm-search input:not([type])': {
      backgroundColor: '#f8f8fb',
      color: '#1c1c24',
    },
  },
  { dark: false },
)

function buildExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    bracketMatching(),
    search({ top: true }),
    highlightSelectionMatches(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
    yaml(),
    syntaxHighlighting(
      themeStore.theme === 'dark' ? darkHighlight : defaultHighlightStyle,
      { fallback: true },
    ),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        editorStore.setContent(update.state.doc.toString())
      }
      if (update.selectionSet) {
        editorStore.cursorOffset = update.state.selection.main.head
      }
    }),
    ...(themeStore.theme === 'dark' ? [darkTheme] : [lightTheme]),
    panelTheme,
  ]
}

/** 面板结构样式（亮暗共用，使用 CSS 变量） */
const panelTheme = EditorView.theme(panelStyles as Record<string, Record<string, string>>, {
  dark: false,
})

onMounted(() => {
  if (!container.value) return
  view = new EditorView({
    state: EditorState.create({ doc: editorStore.content, extensions: buildExtensions() }),
    parent: container.value,
  })
})

// 外部内容变化（拉取远端 / 表单编辑 / 回滚）时同步到编辑器
watch(
  () => editorStore.content,
  (next) => {
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== next) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: next } })
    }
  },
)

// 主题切换时重建编辑器外观
watch(
  () => themeStore.theme,
  () => {
    if (!view) return
    view.setState(EditorState.create({ doc: editorStore.content, extensions: buildExtensions() }))
  },
)

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

export interface YamlEditorExposed {
  /** 格式化 YAML，返回错误信息（成功为 null） */
  format(): string | null
  openSearch(): void
  /** 跳转并选中指定字符偏移位置 */
  revealPosition(offset: number): void
}

/**
 * 格式化：解析后重新序列化（保留注释，lineWidth: 0 不对长行折行）。
 * 供父组件工具栏调用。
 */
function format(): string | null {
  if (!view) return '编辑器未就绪'
  const text = view.state.doc.toString()
  try {
    const doc = parseDocument(text)
    if (doc.errors.length > 0) {
      const err = doc.errors[0]
      const line = err.linePos?.[0]?.line
      return line !== undefined ? `第 ${line} 行：${err.message}` : err.message
    }
    const formatted = doc.toString({ lineWidth: 0 })
    if (formatted !== text) {
      view.dispatch({ changes: { from: 0, to: text.length, insert: formatted } })
    }
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

function openSearchPanelFn(): void {
  if (view) openSearchPanel(view)
}

function revealPosition(offset: number): void {
  if (!view) return
  const pos = Math.max(0, Math.min(offset, view.state.doc.length))
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 48 }),
  })
  view.focus()
}

defineExpose<YamlEditorExposed>({ format, openSearch: openSearchPanelFn, revealPosition })
</script>

<template>
  <div
    ref="container"
    style="height: 100%; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden"
  />
</template>
