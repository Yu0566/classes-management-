import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Droplets, Sun, Leaf, Bug, TreePine, Sparkles, Settings } from 'lucide-react'
import * as treeApi from '@/lib/tree'
import type { GroupTree, TreeActionType } from '@/types'

const isTeacherMode = () => {
  if ((window as any).electronAPI?.db) return false
  return window.location.protocol === 'http:' || window.location.protocol === 'https:'
}

type TreeWithGroup = GroupTree & { group_name: string; group_color: string; total_score: number }

// ============ 8种植物配色 ============

const SPECIES = [
  { name: '樱花', accent: '#F48FB1', light: '#FCE4EC', dark: '#C2185B' },
  { name: '向日葵', accent: '#FFD54F', light: '#FFF9C4', dark: '#F57F17' },
  { name: '竹子', accent: '#4DB6AC', light: '#E0F2F1', dark: '#00695C' },
  { name: '梅花', accent: '#EF5350', light: '#FFEBEE', dark: '#B71C1C' },
  { name: '薰衣草', accent: '#BA68C8', light: '#F3E5F5', dark: '#6A1B9A' },
  { name: '银杏', accent: '#FFC107', light: '#FFF8E1', dark: '#E65100' },
  { name: '橘子树', accent: '#FF8A65', light: '#FBE9E7', dark: '#E64A19' },
  { name: '玫瑰', accent: '#E53935', light: '#FFCDD2', dark: '#B71C1C' },
]

// ============ 种子 Level 0 ============

function SeedSvg({ species }: { species: number }) {
  const colors = ['#C2185B', '#F57F17', '#00695C', '#B71C1C', '#6A1B9A', '#E65100', '#E64A19', '#B71C1C']
  const accents = ['#F48FB1', '#FFD54F', '#4DB6AC', '#EF5350', '#BA68C8', '#FFC107', '#FF8A65', '#E53935']
  return (
    <svg viewBox="0 0 100 120" className="w-full h-full">
      <ellipse cx="50" cy="102" rx="26" ry="9" fill="#8D6E63" />
      <ellipse cx="50" cy="94" rx="7" ry="9" fill={colors[species]} transform="rotate(-5 50 94)" />
      <ellipse cx="48" cy="91" rx="3" ry="4" fill={accents[species]} opacity="0.6" />
      <path d="M49 88 Q48 83 49.5 78" stroke="#4CAF50" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="49.5" cy="76" rx="3" ry="4" fill="#66BB6A" />
    </svg>
  )
}

// ============ 发芽 Level 1 ============

function SproutSvg({ species }: { species: number }) {
  const accents = ['#F48FB1', '#FFD54F', '#4DB6AC', '#EF5350', '#BA68C8', '#FFC107', '#FF8A65', '#E53935']
  return (
    <svg viewBox="0 0 100 120" className="w-full h-full">
      <ellipse cx="50" cy="106" rx="20" ry="7" fill="#8D6E63" />
      <path d="M50 104 Q49 86 50 68" stroke="#43A047" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M49 80 Q38 72 34 64 Q42 63 49 74" fill="#66BB6A" />
      <path d="M51 72 Q62 64 67 56 Q58 56 51 66" fill="#66BB6A" />
      <circle cx="50" cy="64" r="3" fill={accents[species]} />
    </svg>
  )
}

// ============ 樱花树 (species 0) ============

function CherryBlossom2() {
  return (
    <svg viewBox="0 0 100 120" className="w-full h-full">
      <ellipse cx="50" cy="110" rx="18" ry="5" fill="#6D4C41" opacity="0.3" />
      <path d="M50 108 Q49 88 50 68" stroke="#5D4037" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M49 85 Q40 78 35 72" stroke="#5D4037" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M51 76 Q60 70 65 64" stroke="#5D4037" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="50" cy="55" rx="22" ry="18" fill="#66BB6A" />
      <ellipse cx="36" cy="68" rx="10" ry="8" fill="#81C784" />
      <ellipse cx="64" cy="63" rx="9" ry="7" fill="#81C784" />
      {[42, 55, 48, 60, 38, 52].map((x, i) => (
        <circle key={i} cx={x} cy={48 + i * 4} r="2.5" fill={i % 2 === 0 ? '#F48FB1' : '#EC407A'} />
      ))}
    </svg>
  )
}

function CherryBlossom3() {
  return (
    <svg viewBox="0 0 120 140" className="w-full h-full">
      <ellipse cx="58" cy="130" rx="22" ry="5" fill="#6D4C41" opacity="0.2" />
      <path d="M58 128 Q57 105 58 78" stroke="#5D4037" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M57 100 Q46 92 40 86" stroke="#5D4037" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M59 88 Q68 80 75 74" stroke="#5D4037" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <ellipse cx="58" cy="56" rx="30" ry="24" fill="#4CAF50" />
      <ellipse cx="40" cy="72" rx="14" ry="11" fill="#66BB6A" />
      <ellipse cx="76" cy="68" rx="13" ry="10" fill="#66BB6A" />
      {[35, 48, 58, 68, 78, 42, 65, 52, 72, 45].map((x, i) => (
        <circle key={i} cx={x} cy={42 + (i % 4) * 8} r="3" fill={i % 3 === 0 ? '#EC407A' : i % 3 === 1 ? '#F48FB1' : '#F8BBD0'} />
      ))}
    </svg>
  )
}

function CherryBlossom4() {
  return (
    <svg viewBox="0 0 140 160" className="w-full h-full">
      <ellipse cx="68" cy="150" rx="28" ry="5" fill="#6D4C41" opacity="0.2" />
      <path d="M68 148 Q66 118 68 82" stroke="#5D4037" strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d="M67 115 Q52 105 42 96" stroke="#5D4037" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M69 98 Q82 88 92 80" stroke="#5D4037" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <ellipse cx="68" cy="62" rx="38" ry="30" fill="#F48FB1" />
      <ellipse cx="42" cy="88" rx="16" ry="13" fill="#F8BBD0" />
      <ellipse cx="92" cy="74" rx="14" ry="11" fill="#F8BBD0" />
      {[[42, 44], [56, 38], [72, 40], [85, 48], [36, 54], [52, 50], [68, 46], [82, 56],
        [45, 62], [60, 58], [76, 60], [90, 64], [38, 72], [55, 68], [70, 66], [48, 78],
        [65, 74], [80, 70], [42, 86], [58, 82]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.5 + (i % 3)} fill={i % 2 === 0 ? '#EC407A' : '#FCE4EC'} />
      ))}
    </svg>
  )
}

function CherryBlossom5() {
  return (
    <svg viewBox="0 0 160 180" className="w-full h-full">
      <ellipse cx="78" cy="170" rx="32" ry="5" fill="#6D4C41" opacity="0.2" />
      <path d="M78 168 Q75 135 76 88" stroke="#5D4037" strokeWidth="11" fill="none" strokeLinecap="round" />
      <path d="M76 130 Q58 116 45 105" stroke="#5D4037" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <path d="M77 108 Q92 96 105 86" stroke="#5D4037" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <path d="M76 95 Q62 84 52 75" stroke="#5D4037" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <ellipse cx="76" cy="62" rx="46" ry="36" fill="#F48FB1" />
      <ellipse cx="45" cy="95" rx="20" ry="15" fill="#F8BBD0" />
      <ellipse cx="105" cy="80" rx="18" ry="13" fill="#F8BBD0" />
      <ellipse cx="52" cy="70" rx="16" ry="12" fill="#F8BBD0" />
      {[[42, 40], [58, 34], [74, 36], [92, 42], [108, 48], [36, 50], [52, 46], [68, 42],
        [84, 45], [100, 50], [44, 60], [62, 56], [78, 54], [94, 58], [112, 62],
        [38, 70], [56, 66], [72, 64], [88, 68], [104, 72], [44, 80], [62, 76],
        [80, 74], [96, 78], [46, 90], [64, 86], [82, 84], [42, 98], [58, 94], [74, 90]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3 + (i % 3) * 0.8} fill={i % 3 === 0 ? '#EC407A' : i % 3 === 1 ? '#F48FB1' : '#FCE4EC'} />
      ))}
    </svg>
  )
}

// ============ 向日葵 (species 1) ============

function Sunflower2() {
  return (
    <svg viewBox="0 0 100 120" className="w-full h-full">
      <ellipse cx="50" cy="110" rx="16" ry="4" fill="#6D4C41" opacity="0.2" />
      <path d="M50 108 Q49 82 50 58" stroke="#558B2F" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M48 80 Q38 74 34 68" stroke="#558B2F" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="32" cy="66" rx="7" ry="5" fill="#66BB6A" />
      <path d="M52 72 Q60 66 65 60" stroke="#558B2F" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="66" cy="58" rx="6" ry="4.5" fill="#66BB6A" />
      <circle cx="50" cy="46" r="8" fill="#5D4037" />
      {Array.from({ length: 10 }, (_, i) => {
        const angle = (i / 10) * Math.PI * 2
        return <ellipse key={i} cx={50 + Math.cos(angle) * 12} cy={46 + Math.sin(angle) * 12} rx="5" ry="2.5" fill="#FFD54F" transform={`rotate(${i * 36} ${50 + Math.cos(angle) * 12} ${46 + Math.sin(angle) * 12})`} />
      })}
    </svg>
  )
}

function Sunflower3() {
  return (
    <svg viewBox="0 0 120 140" className="w-full h-full">
      <ellipse cx="58" cy="132" rx="18" ry="4" fill="#6D4C41" opacity="0.2" />
      <path d="M58 130 Q57 100 58 65" stroke="#558B2F" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <path d="M56 105 Q44 96 38 88" stroke="#558B2F" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="36" cy="86" rx="10" ry="6" fill="#66BB6A" />
      <path d="M60 90 Q70 82 76 76" stroke="#558B2F" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="78" cy="74" rx="9" ry="5.5" fill="#66BB6A" />
      <circle cx="58" cy="45" r="13" fill="#5D4037" />
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2
        return <ellipse key={i} cx={58 + Math.cos(angle) * 18} cy={45 + Math.sin(angle) * 18} rx="7" ry="3.5" fill={i % 2 === 0 ? '#FFD54F' : '#FFC107'} transform={`rotate(${i * 30} ${58 + Math.cos(angle) * 18} ${45 + Math.sin(angle) * 18})`} />
      })}
      <circle cx="58" cy="45" r="9" fill="#4E342E" />
    </svg>
  )
}

function Sunflower4() {
  return (
    <svg viewBox="0 0 140 160" className="w-full h-full">
      <ellipse cx="68" cy="152" rx="22" ry="5" fill="#6D4C41" opacity="0.2" />
      <path d="M68 150 Q66 115 68 70" stroke="#558B2F" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M66 125 Q50 112 42 102" stroke="#558B2F" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <ellipse cx="39" cy="99" rx="12" ry="7" fill="#66BB6A" />
      <path d="M70 105 Q84 94 92 86" stroke="#558B2F" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <ellipse cx="94" cy="83" rx="11" ry="6.5" fill="#66BB6A" />
      <circle cx="68" cy="42" r="17" fill="#5D4037" />
      {Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2
        return <ellipse key={i} cx={68 + Math.cos(angle) * 24} cy={42 + Math.sin(angle) * 24} rx="9" ry="4.5" fill={i % 3 === 0 ? '#FFA000' : i % 3 === 1 ? '#FFD54F' : '#FFEB3B'} transform={`rotate(${i * 25.7} ${68 + Math.cos(angle) * 24} ${42 + Math.sin(angle) * 24})`} />
      })}
      <circle cx="68" cy="42" r="13" fill="#3E2723" />
    </svg>
  )
}

function Sunflower5() {
  return (
    <svg viewBox="0 0 160 180" className="w-full h-full">
      <ellipse cx="78" cy="172" rx="26" ry="5" fill="#6D4C41" opacity="0.2" />
      <path d="M78 170 Q75 125 76 72" stroke="#558B2F" strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d="M75 140 Q56 125 45 112" stroke="#558B2F" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <ellipse cx="42" cy="109" rx="14" ry="8" fill="#66BB6A" />
      <path d="M77 118 Q95 105 106 95" stroke="#558B2F" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <ellipse cx="108" cy="92" rx="13" ry="7.5" fill="#66BB6A" />
      {/* 主花 */}
      <circle cx="78" cy="40" r="22" fill="#4E342E" />
      {Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2
        return <ellipse key={i} cx={78 + Math.cos(angle) * 30} cy={40 + Math.sin(angle) * 30} rx="11" ry="5.5" fill={i % 3 === 0 ? '#FFA000' : i % 3 === 1 ? '#FFD54F' : '#FFEB3B'} transform={`rotate(${i * 22.5} ${78 + Math.cos(angle) * 30} ${40 + Math.sin(angle) * 30})`} />
      })}
      <circle cx="78" cy="40" r="16" fill="#3E2723" />
      {/* 副花 */}
      <circle cx="45" cy="82" r="9" fill="#5D4037" />
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2
        return <ellipse key={`s${i}`} cx={45 + Math.cos(angle) * 13} cy={82 + Math.sin(angle) * 13} rx="6" ry="3" fill="#FFD54F" transform={`rotate(${i * 45} ${45 + Math.cos(angle) * 13} ${82 + Math.sin(angle) * 13})`} />
      })}
    </svg>
  )
}

// ============ 竹子 (species 2) ============

function Bamboo2() {
  return (
    <svg viewBox="0 0 100 120" className="w-full h-full">
      <ellipse cx="50" cy="110" rx="16" ry="4" fill="#6D4C41" opacity="0.2" />
      <path d="M50 108 L50 52" stroke="#43A047" strokeWidth="5" fill="none" strokeLinecap="round" />
      <rect x="47" y="72" width="6" height="3" rx="1" fill="#2E7D32" opacity="0.5" />
      <rect x="47" y="88" width="6" height="3" rx="1" fill="#2E7D32" opacity="0.5" />
      <path d="M50 68 Q58 60 66 56" stroke="#43A047" strokeWidth="2" fill="none" />
      <ellipse cx="68" cy="55" rx="8" ry="3" fill="#66BB6A" transform="rotate(-20 68 55)" />
      <path d="M50 58 Q42 50 36 46" stroke="#43A047" strokeWidth="2" fill="none" />
      <ellipse cx="34" cy="45" rx="8" ry="3" fill="#66BB6A" transform="rotate(20 34 45)" />
    </svg>
  )
}

function Bamboo3() {
  return (
    <svg viewBox="0 0 120 140" className="w-full h-full">
      <path d="M52 132 L52 35" stroke="#2E8B57" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <path d="M68 132 L68 48" stroke="#43A047" strokeWidth="5" fill="none" strokeLinecap="round" />
      {[50, 70, 90, 110].map((y, i) => <rect key={i} x="49" y={y} width="6" height="3" rx="1" fill="#1B5E20" opacity="0.4" />)}
      {[60, 80, 100, 120].map((y, i) => <rect key={`r${i}`} x="65" y={y} width="6" height="3" rx="1" fill="#1B5E20" opacity="0.4" />)}
      <path d="M52 40 Q44 38 38 42" stroke="#43A047" strokeWidth="1.5" fill="none" />
      <ellipse cx="36" cy="42" rx="10" ry="3.5" fill="#66BB6A" transform="rotate(25 36 42)" />
      <path d="M52 36 Q58 34 64 36" stroke="#43A047" strokeWidth="1.5" fill="none" />
      <ellipse cx="66" cy="36" rx="10" ry="3.5" fill="#4CAF50" transform="rotate(-15 66 36)" />
      <path d="M68 52 Q74 50 80 52" stroke="#43A047" strokeWidth="1.5" fill="none" />
      <ellipse cx="82" cy="52" rx="9" ry="3" fill="#66BB6A" transform="rotate(-25 82 52)" />
      <path d="M52 50 Q46 50 42 52" stroke="#43A047" strokeWidth="1.5" fill="none" />
      <ellipse cx="40" cy="53" rx="9" ry="3" fill="#4CAF50" transform="rotate(20 40 53)" />
    </svg>
  )
}

function Bamboo4() {
  return (
    <svg viewBox="0 0 140 160" className="w-full h-full">
      <path d="M50 152 L50 25" stroke="#2E8B57" strokeWidth="6.5" fill="none" strokeLinecap="round" />
      <path d="M70 152 L70 35" stroke="#43A047" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M90 152 L90 45" stroke="#388E3C" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      {[40, 65, 90, 115, 138].map((y, i) => <rect key={i} x="47" y={y} width="6" height="3.5" rx="1" fill="#1B5E20" opacity="0.4" />)}
      {[50, 75, 100, 125].map((y, i) => <rect key={`m${i}`} x="67" y={y} width="6" height="3.5" rx="1" fill="#1B5E20" opacity="0.4" />)}
      {[60, 85, 110, 135].map((y, i) => <rect key={`r${i}`} x="87" y={y} width="6" height="3.5" rx="1" fill="#1B5E20" opacity="0.4" />)}
      {/* 从竹竿顶部长出的枝叶 */}
      <path d="M50 30 Q40 28 34 30" stroke="#43A047" strokeWidth="1.5" fill="none" />
      <ellipse cx="32" cy="30" rx="12" ry="4" fill="#66BB6A" transform="rotate(30 32 30)" />
      <path d="M50 27 Q56 26 62 28" stroke="#43A047" strokeWidth="1.5" fill="none" />
      <ellipse cx="64" cy="28" rx="11" ry="3.5" fill="#4CAF50" transform="rotate(-20 64 28)" />
      <path d="M70 38 Q76 36 82 38" stroke="#43A047" strokeWidth="1.5" fill="none" />
      <ellipse cx="84" cy="38" rx="11" ry="3.5" fill="#66BB6A" transform="rotate(-15 84 38)" />
      <path d="M90 48 Q98 46 106 48" stroke="#388E3C" strokeWidth="1.5" fill="none" />
      <ellipse cx="108" cy="48" rx="12" ry="4" fill="#66BB6A" transform="rotate(-30 108 48)" />
      <path d="M50 42 Q42 42 36 44" stroke="#43A047" strokeWidth="1.5" fill="none" />
      <ellipse cx="34" cy="44" rx="10" ry="3.5" fill="#4CAF50" transform="rotate(25 34 44)" />
      <path d="M90 55 Q96 54 102 56" stroke="#388E3C" strokeWidth="1.5" fill="none" />
      <ellipse cx="104" cy="56" rx="10" ry="3.5" fill="#81C784" transform="rotate(-20 104 56)" />
    </svg>
  )
}

function Bamboo5() {
  return (
    <svg viewBox="0 0 160 180" className="w-full h-full">
      <path d="M45 172 L45 15" stroke="#2E8B57" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M68 172 L68 22" stroke="#43A047" strokeWidth="6.5" fill="none" strokeLinecap="round" />
      <path d="M91 172 L91 30" stroke="#388E3C" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M112 172 L112 42" stroke="#2E7D32" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      {Array.from({ length: 14 }, (_, i) => {
        const col = i % 4
        const row = Math.floor(i / 4)
        const x = [42, 65, 88, 109][col]
        const baseY = [15, 22, 30, 42][col]
        const y = baseY + 30 + row * 35
        if (y > 160) return null
        return <rect key={i} x={x} y={y} width="6" height="3.5" rx="1" fill="#1B5E20" opacity="0.4" />
      })}
      {/* 竹叶从竹竿节点处长出 */}
      {Array.from({ length: 12 }, (_, i) => {
        const bases = [45, 68, 91, 112]
        const tops = [15, 22, 30, 42]
        const col = i % 4
        const bx = bases[col]
        const by = tops[col] + 5 + Math.floor(i / 4) * 18
        const dir = i % 2 === 0 ? -1 : 1
        const lx = bx + dir * 16
        return (
          <g key={i}>
            <path d={`M${bx} ${by} Q${bx + dir * 8} ${by - 2} ${lx} ${by}`} stroke="#43A047" strokeWidth="1.2" fill="none" />
            <ellipse cx={lx} cy={by} rx="12" ry="3.5" fill={i % 2 === 0 ? '#66BB6A' : '#4CAF50'} transform={`rotate(${dir * 25} ${lx} ${by})`} />
          </g>
        )
      })}
    </svg>
  )
}

// ============ 梅花 (species 3) ============

function PlumBlossom2() {
  return (
    <svg viewBox="0 0 100 120" className="w-full h-full">
      <ellipse cx="50" cy="110" rx="16" ry="4" fill="#6D4C41" opacity="0.2" />
      <path d="M50 108 Q48 88 46 68 Q44 58 48 48" stroke="#3E2723" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M47 80 Q38 74 32 68" stroke="#3E2723" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M48 66 Q56 60 62 54" stroke="#3E2723" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {[[48, 46], [36, 66], [60, 52], [44, 56], [56, 62]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="4" fill={i % 2 === 0 ? '#EF5350' : '#E53935'} />
          <circle cx={x} cy={y} r="1.5" fill="#FFCDD2" />
        </g>
      ))}
    </svg>
  )
}

function PlumBlossom3() {
  return (
    <svg viewBox="0 0 120 140" className="w-full h-full">
      <ellipse cx="58" cy="132" rx="20" ry="5" fill="#6D4C41" opacity="0.2" />
      <path d="M58 130 Q55 100 52 76 Q50 62 54 48" stroke="#3E2723" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <path d="M54 95 Q40 85 32 76" stroke="#3E2723" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M55 74 Q68 64 76 54" stroke="#3E2723" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M53 58 Q42 50 36 42" stroke="#3E2723" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* 花朵在枝头 */}
      {[[32, 74], [28, 70], [36, 78], [76, 52], [72, 48], [78, 56], [36, 40], [32, 44], [54, 46], [50, 50], [56, 54], [48, 60]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="4.5" fill={i % 2 === 0 ? '#EF5350' : '#E53935'} />
          <circle cx={x} cy={y} r="1.8" fill="#FFCDD2" />
        </g>
      ))}
    </svg>
  )
}

function PlumBlossom4() {
  return (
    <svg viewBox="0 0 140 160" className="w-full h-full">
      <ellipse cx="68" cy="152" rx="24" ry="5" fill="#6D4C41" opacity="0.2" />
      <path d="M68 150 Q64 115 60 86 Q58 68 62 50" stroke="#3E2723" strokeWidth="7.5" fill="none" strokeLinecap="round" />
      <path d="M62 112 Q45 96 35 83" stroke="#3E2723" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M63 85 Q78 72 90 60" stroke="#3E2723" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M61 63 Q48 53 38 43" stroke="#3E2723" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M62 53 Q72 43 82 36" stroke="#3E2723" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {/* 花朵沿枝分布 */}
      {[[35, 81], [30, 78], [38, 86], [40, 90], [90, 58], [86, 54], [92, 62], [84, 66], [38, 41], [34, 38], [42, 46], [82, 34], [78, 30], [85, 38], [62, 48], [58, 52], [64, 56], [55, 70]].map(([x, y], i) => {
        const size = 5 + (i % 3)
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={size} fill={i % 3 === 0 ? '#C62828' : i % 3 === 1 ? '#EF5350' : '#E53935'} />
            <circle cx={x} cy={y} r={size * 0.35} fill="#FFCDD2" />
          </g>
        )
      })}
    </svg>
  )
}

function PlumBlossom5() {
  return (
    <svg viewBox="0 0 160 180" className="w-full h-full">
      <ellipse cx="78" cy="172" rx="28" ry="5" fill="#6D4C41" opacity="0.2" />
      <path d="M78 170 Q72 125 68 92 Q65 70 70 48" stroke="#3E2723" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M70 130 Q50 112 38 95" stroke="#3E2723" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <path d="M71 100 Q90 82 105 68" stroke="#3E2723" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <path d="M69 75 Q52 62 40 50" stroke="#3E2723" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M70 58 Q85 46 98 36" stroke="#3E2723" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M68 48 Q58 38 50 30" stroke="#3E2723" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {/* 花朵沿枝分布 */}
      {[[38, 93], [34, 89], [42, 97], [44, 105], [105, 66], [101, 62], [108, 70], [96, 74], [40, 48], [36, 44], [44, 52], [98, 34], [94, 30], [102, 38], [92, 42], [50, 28], [46, 24], [54, 32], [70, 46], [66, 42], [74, 50], [60, 56], [56, 60], [64, 64], [52, 108], [80, 78], [76, 82], [85, 58]].map(([x, y], i) => {
        const size = 5.5 + (i % 3) * 1.5
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={size} fill={i % 4 === 0 ? '#B71C1C' : i % 4 === 1 ? '#C62828' : i % 4 === 2 ? '#EF5350' : '#F44336'} />
            <circle cx={x} cy={y} r={size * 0.3} fill="#FFCDD2" />
          </g>
        )
      })}
    </svg>
  )
}

// ============ 薰衣草 (species 4) ============

function Lavender2() {
  return (
    <svg viewBox="0 0 100 120" className="w-full h-full">
      <ellipse cx="50" cy="110" rx="16" ry="4" fill="#6D4C41" opacity="0.2" />
      <path d="M42 108 Q42 84 42 62" stroke="#558B2F" strokeWidth="2.5" fill="none" />
      <path d="M50 108 Q50 80 50 56" stroke="#558B2F" strokeWidth="2.5" fill="none" />
      <path d="M58 108 Q58 84 58 62" stroke="#558B2F" strokeWidth="2.5" fill="none" />
      <ellipse cx="42" cy="56" rx="4" ry="10" fill="#9C27B0" />
      <ellipse cx="50" cy="50" rx="4" ry="12" fill="#7B1FA2" />
      <ellipse cx="58" cy="56" rx="4" ry="10" fill="#9C27B0" />
      <ellipse cx="35" cy="88" rx="6" ry="3.5" fill="#66BB6A" transform="rotate(25 35 88)" />
      <ellipse cx="65" cy="88" rx="6" ry="3.5" fill="#66BB6A" transform="rotate(-25 65 88)" />
    </svg>
  )
}

function Lavender3() {
  return (
    <svg viewBox="0 0 120 140" className="w-full h-full">
      <ellipse cx="58" cy="132" rx="22" ry="5" fill="#6D4C41" opacity="0.2" />
      {[38, 48, 58, 68, 78].map((x, i) => (
        <g key={i}>
          <path d={`M${x} 130 Q${x + (i % 2 === 0 ? 1 : -1)} 95 ${x + (i % 2 === 0 ? 2 : -2)} ${62 - i * 2}`} stroke="#558B2F" strokeWidth="2.5" fill="none" />
          <ellipse cx={x + (i % 2 === 0 ? 2 : -2)} cy={56 - i * 2} rx="4.5" ry={12 + i} fill={i % 2 === 0 ? '#7B1FA2' : '#9C27B0'} />
        </g>
      ))}
      <ellipse cx="28" cy="100" rx="7" ry="4" fill="#66BB6A" transform="rotate(20 28 100)" />
      <ellipse cx="88" cy="100" rx="7" ry="4" fill="#66BB6A" transform="rotate(-20 88 100)" />
    </svg>
  )
}

function Lavender4() {
  return (
    <svg viewBox="0 0 140 160" className="w-full h-full">
      <ellipse cx="68" cy="152" rx="28" ry="5" fill="#6D4C41" opacity="0.2" />
      {[32, 44, 56, 68, 80, 92, 104].map((x, i) => (
        <g key={i}>
          <path d={`M${x} 150 Q${x + (i % 2 === 0 ? 2 : -2)} 105 ${x + (i % 2 === 0 ? 1 : -1)} ${55 - i * 2}`} stroke="#558B2F" strokeWidth="2.5" fill="none" />
          <ellipse cx={x + (i % 2 === 0 ? 1 : -1)} cy={50 - i * 2} rx="5" ry={14 + i} fill={i % 3 === 0 ? '#6A1B9A' : i % 3 === 1 ? '#9C27B0' : '#BA68C8'} />
        </g>
      ))}
      <ellipse cx="20" cy="118" rx="9" ry="5" fill="#66BB6A" transform="rotate(20 20 118)" />
      <ellipse cx="118" cy="118" rx="9" ry="5" fill="#66BB6A" transform="rotate(-20 118 118)" />
    </svg>
  )
}

function Lavender5() {
  return (
    <svg viewBox="0 0 160 180" className="w-full h-full">
      <ellipse cx="78" cy="172" rx="35" ry="5" fill="#6D4C41" opacity="0.2" />
      {[25, 40, 55, 70, 85, 100, 115, 130].map((x, i) => (
        <g key={i}>
          <path d={`M${x} 170 Q${x + (i % 2 === 0 ? 3 : -3)} 115 ${x + (i % 2 === 0 ? 2 : -2)} ${48 - i * 2}`} stroke="#558B2F" strokeWidth="3" fill="none" />
          <ellipse cx={x + (i % 2 === 0 ? 2 : -2)} cy={42 - i * 2} rx="5.5" ry={16 + i} fill={i % 4 === 0 ? '#4A148C' : i % 4 === 1 ? '#7B1FA2' : i % 4 === 2 ? '#9C27B0' : '#BA68C8'} />
        </g>
      ))}
      <ellipse cx="15" cy="130" rx="10" ry="5.5" fill="#66BB6A" transform="rotate(20 15 130)" />
      <ellipse cx="142" cy="130" rx="10" ry="5.5" fill="#66BB6A" transform="rotate(-20 142 130)" />
    </svg>
  )
}

// ============ 银杏 (species 5) ============

function Ginkgo2() {
  return (
    <svg viewBox="0 0 100 120" className="w-full h-full">
      <ellipse cx="50" cy="110" rx="18" ry="5" fill="#6D4C41" opacity="0.2" />
      <path d="M50 108 Q49 85 50 62" stroke="#5D4037" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M49 82 Q40 74 34 66" stroke="#5D4037" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M51 72 Q60 64 66 56" stroke="#5D4037" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M49 90 Q42 84 38 78" stroke="#5D4037" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* 银杏扇叶 */}
      {[[50, 56, 12], [34, 60, 10], [66, 50, 10], [38, 72, 9], [44, 48, 10], [58, 44, 11], [28, 64, 9], [62, 62, 9]].map(([x, y, size], i) => (
        <path key={i} d={`M${x} ${y + size * 0.8} Q${x - size * 0.7} ${y - size * 0.1} ${x - size * 0.2} ${y - size * 0.6} Q${x} ${y - size * 0.8} ${x + size * 0.2} ${y - size * 0.6} Q${x + size * 0.7} ${y - size * 0.1} ${x} ${y + size * 0.8}`} fill={i % 3 === 0 ? '#FFC107' : i % 3 === 1 ? '#FFD54F' : '#FFCA28'} />
      ))}
    </svg>
  )
}

function Ginkgo3() {
  return (
    <svg viewBox="0 0 120 140" className="w-full h-full">
      <ellipse cx="58" cy="132" rx="22" ry="5" fill="#6D4C41" opacity="0.2" />
      <path d="M58 130 Q57 105 58 68" stroke="#5D4037" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <path d="M57 100 Q44 90 36 80" stroke="#5D4037" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M59 85 Q72 74 80 64" stroke="#5D4037" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M57 110 Q48 102 42 96" stroke="#5D4037" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {([[36, 74, 11], [30, 68, 10], [42, 70, 10],
        [80, 58, 11], [74, 52, 10], [86, 56, 10],
        [58, 60, 12], [52, 52, 11], [64, 54, 11],
        [46, 46, 10], [68, 44, 10], [56, 42, 11],
        [42, 90, 9], [38, 84, 9]] as [number, number, number][]).map(([x, y, size], i) => (
        <path key={i} d={`M${x} ${y + size * 0.8} Q${x - size * 0.7} ${y - size * 0.1} ${x - size * 0.2} ${y - size * 0.6} Q${x} ${y - size * 0.8} ${x + size * 0.2} ${y - size * 0.6} Q${x + size * 0.7} ${y - size * 0.1} ${x} ${y + size * 0.8}`} fill={i % 3 === 0 ? '#FFC107' : i % 3 === 1 ? '#FFD54F' : '#FFCA28'} />
      ))}
    </svg>
  )
}

function Ginkgo4() {
  return (
    <svg viewBox="0 0 140 160" className="w-full h-full">
      <ellipse cx="68" cy="152" rx="26" ry="5" fill="#6D4C41" opacity="0.2" />
      <path d="M68 150 Q66 118 68 76" stroke="#5D4037" strokeWidth="7.5" fill="none" strokeLinecap="round" />
      <path d="M68 76 Q62 66 56 56" stroke="#5D4037" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M68 76 Q76 64 84 54" stroke="#5D4037" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M66 95 Q50 85 40 76" stroke="#5D4037" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M69 90 Q84 80 95 70" stroke="#5D4037" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M67 110 Q56 100 46 92" stroke="#5D4037" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {/* 银杏扇叶 — 更大更饱满 */}
      {[[56, 50, 13], [48, 42, 12], [64, 44, 12], [84, 48, 13], [76, 40, 12], [92, 54, 12],
        [40, 70, 12], [32, 64, 11], [46, 74, 11], [95, 64, 12], [88, 58, 11], [102, 68, 11],
        [46, 86, 11], [38, 80, 10], [54, 90, 10], [68, 34, 12], [74, 30, 11], [60, 30, 11],
        [50, 58, 11], [72, 56, 11], [82, 66, 10], [36, 74, 10]].map(([x, y, size], i) => (
        <path key={i} d={`M${x} ${y + size * 0.8} Q${x - size * 0.7} ${y - size * 0.1} ${x - size * 0.2} ${y - size * 0.6} Q${x} ${y - size * 0.8} ${x + size * 0.2} ${y - size * 0.6} Q${x + size * 0.7} ${y - size * 0.1} ${x} ${y + size * 0.8}`} fill={i % 3 === 0 ? '#FF8F00' : i % 3 === 1 ? '#FFC107' : '#FFD54F'} />
      ))}
    </svg>
  )
}

function Ginkgo5() {
  const leaves: [number, number, number][] = [
    [42, 98, 13], [36, 90, 12], [48, 94, 12], [34, 104, 11], [46, 108, 12],
    [108, 76, 13], [102, 68, 12], [114, 72, 12], [106, 82, 11], [114, 84, 12],
    [48, 60, 13], [40, 52, 12], [56, 56, 12], [44, 66, 11], [54, 50, 12],
    [100, 52, 13], [94, 44, 12], [108, 48, 12], [96, 58, 11], [106, 42, 12],
    [76, 66, 14], [68, 58, 13], [84, 62, 13], [72, 52, 12], [82, 50, 13],
    [78, 40, 14], [70, 34, 13], [86, 36, 13], [76, 28, 12], [84, 28, 12],
    [62, 42, 12], [92, 38, 12], [66, 48, 11], [88, 46, 11],
  ]
  return (
    <svg viewBox="0 0 160 180" className="w-full h-full">
      <ellipse cx="78" cy="172" rx="32" ry="5" fill="#6D4C41" opacity="0.2" />
      <path d="M78 170 Q74 130 76 72" stroke="#5D4037" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M75 135 Q55 118 42 105" stroke="#5D4037" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <path d="M77 110 Q95 95 108 82" stroke="#5D4037" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <path d="M76 92 Q58 76 48 64" stroke="#5D4037" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M77 80 Q92 66 102 56" stroke="#5D4037" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M76 72 Q72 60 70 50" stroke="#5D4037" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M76 72 Q82 58 86 48" stroke="#5D4037" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {leaves.map(([x, y, size], i) => (
        <path key={i} d={`M${x} ${y + size * 0.8} Q${x - size * 0.7} ${y - size * 0.1} ${x - size * 0.2} ${y - size * 0.6} Q${x} ${y - size * 0.8} ${x + size * 0.2} ${y - size * 0.6} Q${x + size * 0.7} ${y - size * 0.1} ${x} ${y + size * 0.8}`} fill={i % 4 === 0 ? '#E65100' : i % 4 === 1 ? '#FF8F00' : i % 4 === 2 ? '#FFC107' : '#FFCA28'} />
      ))}
    </svg>
  )
}

// ============ 橘子树 (species 6) ============

function OrangeTree2() {
  return (
    <svg viewBox="0 0 100 120" className="w-full h-full">
      <ellipse cx="50" cy="110" rx="16" ry="4" fill="#6D4C41" opacity="0.2" />
      <path d="M50 108 Q49 88 50 66" stroke="#4E342E" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M49 82 Q40 76 35 70" stroke="#4E342E" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M51 74 Q60 68 65 62" stroke="#4E342E" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="50" cy="52" rx="22" ry="18" fill="#43A047" />
      <ellipse cx="36" cy="66" rx="10" ry="8" fill="#66BB6A" />
      <ellipse cx="64" cy="62" rx="9" ry="7" fill="#66BB6A" />
      <circle cx="46" cy="48" r="3.5" fill="#FF8A65" />
      <circle cx="56" cy="55" r="3" fill="#FF7043" />
    </svg>
  )
}

function OrangeTree3() {
  return (
    <svg viewBox="0 0 120 140" className="w-full h-full">
      <ellipse cx="58" cy="132" rx="20" ry="5" fill="#6D4C41" opacity="0.2" />
      <path d="M58 130 Q57 105 58 75" stroke="#4E342E" strokeWidth="6.5" fill="none" strokeLinecap="round" />
      <path d="M57 100 Q44 90 36 82" stroke="#4E342E" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M59 86 Q72 76 80 68" stroke="#4E342E" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <ellipse cx="58" cy="52" rx="30" ry="24" fill="#388E3C" />
      <ellipse cx="36" cy="68" rx="14" ry="11" fill="#43A047" />
      <ellipse cx="80" cy="64" rx="13" ry="10" fill="#43A047" />
      {[42, 58, 72, 48, 65].map((x, i) => (
        <g key={i}>
          <circle cx={x} cy={44 + (i % 3) * 8} r={4 + i % 2} fill={i % 2 === 0 ? '#FF7043' : '#FF5722'} />
          <circle cx={x - 1} cy={44 + (i % 3) * 8 - 1} r="1" fill="white" opacity="0.4" />
        </g>
      ))}
    </svg>
  )
}

function OrangeTree4() {
  return (
    <svg viewBox="0 0 140 160" className="w-full h-full">
      <ellipse cx="68" cy="152" rx="24" ry="5" fill="#6D4C41" opacity="0.2" />
      {/* 主干 */}
      <path d="M68 150 Q66 118 68 80" stroke="#4E342E" strokeWidth="8.5" fill="none" strokeLinecap="round" />
      {/* 主要枝干（连接树冠） */}
      <path d="M68 80 Q60 68 55 58" stroke="#4E342E" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M68 80 Q78 66 85 56" stroke="#4E342E" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M66 95 Q50 85 40 76" stroke="#4E342E" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M69 90 Q84 80 95 72" stroke="#4E342E" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {/* 树冠（绿叶） */}
      <ellipse cx="68" cy="48" rx="38" ry="30" fill="#2E7D32" />
      <ellipse cx="42" cy="65" rx="16" ry="13" fill="#388E3C" />
      <ellipse cx="95" cy="62" rx="15" ry="12" fill="#388E3C" />
      <ellipse cx="68" cy="32" rx="20" ry="14" fill="#43A047" />
      {/* 橘子 — 沿枝干分布 */}
      {[[52, 52], [60, 42], [76, 44], [85, 52], [45, 62], [92, 58], [68, 34], [58, 60], [78, 62], [66, 52]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={5 + i % 2} fill={i % 3 === 0 ? '#E64A19' : i % 3 === 1 ? '#FF5722' : '#FF8A65'} />
          <circle cx={x - 1.5} cy={y - 1.5} r="1.2" fill="white" opacity="0.35" />
        </g>
      ))}
    </svg>
  )
}

function OrangeTree5() {
  return (
    <svg viewBox="0 0 160 180" className="w-full h-full">
      <ellipse cx="78" cy="172" rx="30" ry="5" fill="#6D4C41" opacity="0.2" />
      {/* 主干和枝干 */}
      <path d="M78 170 Q74 130 76 82" stroke="#4E342E" strokeWidth="11" fill="none" strokeLinecap="round" />
      <path d="M76 82 Q66 68 58 55" stroke="#4E342E" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <path d="M76 82 Q88 66 98 54" stroke="#4E342E" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M75 105 Q55 92 42 80" stroke="#4E342E" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M77 100 Q95 88 110 76" stroke="#4E342E" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M76 92 Q62 78 50 66" stroke="#4E342E" strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* 树冠 */}
      <ellipse cx="78" cy="42" rx="48" ry="36" fill="#2E7D32" />
      <ellipse cx="42" cy="68" rx="20" ry="16" fill="#388E3C" />
      <ellipse cx="115" cy="64" rx="18" ry="14" fill="#388E3C" />
      <ellipse cx="78" cy="22" rx="24" ry="16" fill="#43A047" />
      {/* 橘子沿枝干 */}
      {[[56, 50], [62, 38], [78, 30], [94, 38], [100, 50], [44, 64], [112, 60], [68, 44], [88, 44], [72, 56], [84, 58], [50, 72], [106, 68], [78, 18]].map(([x, y], i) => {
        const r = 6 + (i % 3) * 1.5
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={r} fill={i % 3 === 0 ? '#E64A19' : i % 3 === 1 ? '#FF5722' : '#FF8A65'} />
            <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.22} fill="white" opacity="0.35" />
            <path d={`M${x} ${y - r} Q${x + 1} ${y - r - 2} ${x + 2.5} ${y - r - 1}`} stroke="#388E3C" strokeWidth="1.2" fill="none" />
          </g>
        )
      })}
    </svg>
  )
}

// ============ 玫瑰 (species 7) ============

function Rose2() {
  return (
    <svg viewBox="0 0 100 120" className="w-full h-full">
      <ellipse cx="50" cy="110" rx="16" ry="4" fill="#6D4C41" opacity="0.2" />
      <path d="M44 108 Q44 88 44 70" stroke="#2E7D32" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M56 108 Q56 90 56 74" stroke="#2E7D32" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="36" cy="82" rx="6" ry="3.5" fill="#4CAF50" transform="rotate(25 36 82)" />
      <ellipse cx="64" cy="85" rx="6" ry="3.5" fill="#4CAF50" transform="rotate(-25 64 85)" />
      <circle cx="44" cy="64" r="5.5" fill="#E53935" />
      <circle cx="44" cy="64" r="2.5" fill="#C62828" />
      <circle cx="56" cy="68" r="5" fill="#C62828" />
      <circle cx="56" cy="68" r="2" fill="#B71C1C" />
    </svg>
  )
}

function Rose3() {
  return (
    <svg viewBox="0 0 120 140" className="w-full h-full">
      <ellipse cx="58" cy="132" rx="22" ry="5" fill="#6D4C41" opacity="0.2" />
      <path d="M38 130 Q36 105 40 78 Q43 63 48 48" stroke="#2E7D32" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M58 130 Q60 108 56 86 Q54 70 56 52" stroke="#2E7D32" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M78 130 Q76 110 73 90 Q70 76 73 60" stroke="#2E7D32" strokeWidth="3" fill="none" strokeLinecap="round" />
      {[[36, 95], [60, 100], [73, 105], [43, 70], [56, 73]].map(([x, y], i) => (
        <ellipse key={i} cx={x + (i % 2 === 0 ? -7 : 7)} cy={y as number} rx="7" ry="4.5" fill="#4CAF50" transform={`rotate(${i % 2 === 0 ? -20 : 20} ${x + (i % 2 === 0 ? -7 : 7)} ${y})`} />
      ))}
      {[[48, 42, 7], [56, 47, 6.5], [73, 55, 6], [40, 55, 5.5]].map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x as number} cy={y as number} r={r as number} fill={i % 2 === 0 ? '#E53935' : '#C62828'} />
          <circle cx={x as number} cy={y as number} r={(r as number) * 0.45} fill={i % 2 === 0 ? '#C62828' : '#B71C1C'} />
        </g>
      ))}
    </svg>
  )
}

function Rose4() {
  return (
    <svg viewBox="0 0 140 160" className="w-full h-full">
      <ellipse cx="68" cy="152" rx="28" ry="5" fill="#6D4C41" opacity="0.2" />
      <path d="M32 150 Q28 118 36 86 Q42 60 48 36" stroke="#2E7D32" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M58 150 Q62 115 56 82 Q50 55 56 30" stroke="#2E7D32" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M84 150 Q80 118 76 88 Q73 62 78 36" stroke="#2E7D32" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M108 150 Q104 122 98 95 Q95 72 100 48" stroke="#2E7D32" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* 叶子 — 沿四根茎 */}
      {[[25, 70, -1], [38, 85, 1], [30, 100, -1], [52, 60, 1], [62, 75, -1], [55, 95, 1],
        [78, 65, -1], [88, 80, 1], [80, 100, -1], [102, 70, 1], [112, 90, -1], [105, 110, 1]].map(([x, y, dir], i) => (
        <ellipse key={i} cx={x + dir * 9} cy={y} rx="8" ry="5" fill={i % 2 === 0 ? '#4CAF50' : '#388E3C'} transform={`rotate(${dir * 25} ${x + dir * 9} ${y})`} />
      ))}
      {/* 玫瑰花 — 在茎顶部和中上段 */}
      {[[46, 40, 8], [38, 55, 7], [56, 34, 8.5], [54, 52, 7], [76, 40, 8], [80, 58, 7.5], [100, 50, 8], [96, 68, 7]].map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r} fill={i % 3 === 0 ? '#B71C1C' : i % 3 === 1 ? '#E53935' : '#EF5350'} />
          <circle cx={x} cy={y} r={r * 0.45} fill={i % 2 === 0 ? '#C62828' : '#B71C1C'} />
        </g>
      ))}
    </svg>
  )
}

function Rose5() {
  return (
    <svg viewBox="0 0 160 180" className="w-full h-full">
      <ellipse cx="78" cy="172" rx="35" ry="5" fill="#6D4C41" opacity="0.2" />
      <path d="M28 170 Q24 128 34 86 Q40 52 46 22" stroke="#1B5E20" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M55 170 Q58 125 50 78 Q46 45 52 15" stroke="#2E7D32" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M82 170 Q78 125 75 82 Q72 50 78 20" stroke="#2E7D32" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M108 170 Q104 128 98 88 Q95 55 100 25" stroke="#388E3C" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M132 170 Q128 132 122 92 Q120 62 124 32" stroke="#388E3C" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {/* 叶子 — 沿五根茎 */}
      {[[22, 65, -1], [32, 90, 1], [26, 110, -1], [49, 58, 1], [60, 80, -1], [52, 105, 1],
        [76, 62, -1], [86, 85, 1], [78, 108, -1], [102, 68, 1], [112, 92, -1], [105, 115, 1],
        [126, 72, -1], [136, 95, 1], [128, 118, -1], [38, 130, 1]].map(([x, y, dir], i) => (
        <ellipse key={i} cx={x + dir * 10} cy={y} rx="9" ry="5.5" fill={i % 2 === 0 ? '#4CAF50' : '#388E3C'} transform={`rotate(${dir * 28} ${x + dir * 10} ${y})`} />
      ))}
      {/* 玫瑰花 — 在茎顶和中上段 */}
      {[[44, 26, 9], [36, 48, 8], [52, 18, 10], [50, 42, 8], [76, 24, 9], [78, 48, 8],
        [100, 28, 9], [96, 52, 8], [124, 36, 9], [120, 58, 8], [60, 68, 8.5], [90, 72, 8]].map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r} fill={i % 4 === 0 ? '#B71C1C' : i % 4 === 1 ? '#C62828' : i % 4 === 2 ? '#E53935' : '#EF5350'} />
          <circle cx={x} cy={y} r={r * 0.5} fill={i % 2 === 0 ? '#C62828' : '#B71C1C'} />
        </g>
      ))}
    </svg>
  )
}

// ============ 植物渲染器 ============

function PlantSvg({ level, species }: { level: number; species: number }) {
  if (level === 0) return <SeedSvg species={species} />
  if (level === 1) return <SproutSvg species={species} />

  const plants: Record<number, React.FC[]> = {
    0: [CherryBlossom2, CherryBlossom3, CherryBlossom4, CherryBlossom5],
    1: [Sunflower2, Sunflower3, Sunflower4, Sunflower5],
    2: [Bamboo2, Bamboo3, Bamboo4, Bamboo5],
    3: [PlumBlossom2, PlumBlossom3, PlumBlossom4, PlumBlossom5],
    4: [Lavender2, Lavender3, Lavender4, Lavender5],
    5: [Ginkgo2, Ginkgo3, Ginkgo4, Ginkgo5],
    6: [OrangeTree2, OrangeTree3, OrangeTree4, OrangeTree5],
    7: [Rose2, Rose3, Rose4, Rose5],
  }

  const speciesPlants = plants[species] || plants[0]
  const Component = speciesPlants[level - 2]
  return Component ? <Component /> : <SeedSvg species={species} />
}

// ============ 清新背景（蚂蚁森林风格） ============

const SQUIRREL_WAYPOINTS = [
  { left: '8%', bottom: '22%' },
  { left: '28%', bottom: '25%' },
  { left: '50%', bottom: '20%' },
  { left: '72%', bottom: '24%' },
  { left: '90%', bottom: '21%' },
  { left: '65%', bottom: '18%' },
  { left: '35%', bottom: '19%' },
  { left: '15%', bottom: '23%' },
]

function FreshBackground() {
  const [squirrelIdx, setSquirrelIdx] = useState(0)
  const [squirrelFlip, setSquirrelFlip] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setSquirrelIdx(prev => {
        const next = (prev + 1) % SQUIRREL_WAYPOINTS.length
        const curLeft = parseFloat(SQUIRREL_WAYPOINTS[prev].left)
        const nextLeft = parseFloat(SQUIRREL_WAYPOINTS[next].left)
        setSquirrelFlip(nextLeft < curLeft)
        return next
      })
    }, 4000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* 清新天空渐变 */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, #7EC8E3 0%, #A8DAEF 15%, #C9E8F5 30%, #E1F5FE 45%, #E8F5E9 60%, #C8E6C9 75%, #A5D6A7 90%, #81C784 100%)'
      }} />

      {/* 太阳 */}
      <svg className="absolute top-[2%] right-[6%] w-[7%] h-[7%] sun-spin" viewBox="0 0 80 80">
        <defs>
          <radialGradient id="sun-glow">
            <stop offset="0%" stopColor="#FFF8E1" />
            <stop offset="40%" stopColor="#FFE082" />
            <stop offset="75%" stopColor="#FFB300" />
            <stop offset="100%" stopColor="#FF8F00" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* 光芒 */}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = i * 30
          const x1 = 40 + 22 * Math.cos(angle * Math.PI / 180)
          const y1 = 40 + 22 * Math.sin(angle * Math.PI / 180)
          const x2 = 40 + 34 * Math.cos(angle * Math.PI / 180)
          const y2 = 40 + 34 * Math.sin(angle * Math.PI / 180)
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FFD54F" strokeWidth={i % 2 === 0 ? '2.5' : '1.5'} strokeLinecap="round" opacity={i % 2 === 0 ? 0.8 : 0.5} />
        })}
        <circle cx="40" cy="40" r="18" fill="url(#sun-glow)" />
        <circle cx="40" cy="40" r="13" fill="#FFD54F" />
        <circle cx="35" cy="36" r="4" fill="#FFECB3" opacity="0.6" />
      </svg>

      {/* 白云（缓慢飘动） */}
      <svg className="absolute top-[6%] w-[20%] h-[9%] cloud-drift" style={{ left: '5%' }} viewBox="0 0 220 90">
        <ellipse cx="110" cy="55" rx="80" ry="28" fill="white" opacity="0.85" />
        <ellipse cx="75" cy="48" rx="50" ry="22" fill="white" opacity="0.9" />
        <ellipse cx="150" cy="50" rx="45" ry="20" fill="white" opacity="0.88" />
        <ellipse cx="110" cy="42" rx="40" ry="16" fill="white" opacity="0.95" />
      </svg>
      <svg className="absolute top-[10%] w-[16%] h-[7%] cloud-drift" style={{ right: '10%', animationDelay: '10s', animationDuration: '55s' }} viewBox="0 0 180 70">
        <ellipse cx="90" cy="40" rx="65" ry="22" fill="white" opacity="0.75" />
        <ellipse cx="60" cy="36" rx="40" ry="18" fill="white" opacity="0.85" />
        <ellipse cx="125" cy="38" rx="35" ry="16" fill="white" opacity="0.8" />
      </svg>
      <svg className="absolute top-[18%] w-[12%] h-[5%] cloud-drift" style={{ left: '40%', animationDelay: '18s', animationDuration: '65s' }} viewBox="0 0 140 50">
        <ellipse cx="70" cy="28" rx="50" ry="18" fill="white" opacity="0.6" />
        <ellipse cx="48" cy="25" rx="32" ry="14" fill="white" opacity="0.7" />
      </svg>

      {/* 飞鸟 */}
      <svg className="absolute top-[13%] left-[18%] w-[3%] h-[2%] bird-fly" viewBox="0 0 30 12">
        <path d="M0 6 Q7 0 15 5 Q23 0 30 6" stroke="#555" strokeWidth="1.5" fill="none" />
      </svg>
      <svg className="absolute top-[9%] left-[55%] w-[2.5%] h-[1.5%] bird-fly" style={{ animationDelay: '4s', animationDuration: '18s' }} viewBox="0 0 30 12">
        <path d="M0 6 Q7 0 15 5 Q23 0 30 6" stroke="#666" strokeWidth="1.5" fill="none" />
      </svg>
      <svg className="absolute top-[20%] left-[72%] w-[2%] h-[1.2%] bird-fly" style={{ animationDelay: '9s', animationDuration: '22s' }} viewBox="0 0 30 12">
        <path d="M0 6 Q7 1 15 5 Q23 1 30 6" stroke="#777" strokeWidth="1.5" fill="none" />
      </svg>

      {/* 远处的绿色山丘 */}
      <svg className="absolute bottom-[30%] left-0 w-full h-[22%]" viewBox="0 0 1440 220" preserveAspectRatio="none">
        <path d="M0 140 Q180 60 360 100 Q540 140 720 80 Q900 20 1080 70 Q1260 120 1440 90 L1440 220 L0 220 Z" fill="#A5D6A7" opacity="0.45" />
      </svg>
      <svg className="absolute bottom-[24%] left-0 w-full h-[20%]" viewBox="0 0 1440 200" preserveAspectRatio="none">
        <path d="M0 100 Q200 40 400 70 Q600 100 800 50 Q1000 10 1200 60 Q1400 95 1440 75 L1440 200 L0 200 Z" fill="#81C784" opacity="0.55" />
      </svg>

      {/* 主地面 */}
      <div className="absolute bottom-0 left-0 w-full h-[38%]">
        <svg className="w-full h-full" viewBox="0 0 1440 360" preserveAspectRatio="none">
          <defs>
            <linearGradient id="ground-fresh" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#66BB6A" />
              <stop offset="35%" stopColor="#4CAF50" />
              <stop offset="70%" stopColor="#43A047" />
              <stop offset="100%" stopColor="#388E3C" />
            </linearGradient>
          </defs>
          <path d="M0 30 Q200 10 400 25 Q600 40 800 15 Q1000 0 1200 20 Q1400 35 1440 20 L1440 360 L0 360 Z" fill="url(#ground-fresh)" />
          {/* 草地纹理 */}
          <path d="M0 50 Q100 42 200 48 Q300 55 400 45 Q500 38 600 46 Q700 52 800 42 Q900 35 1000 44 Q1100 50 1200 40 Q1300 34 1440 42" stroke="#5CB85C" strokeWidth="1.5" fill="none" opacity="0.3" />
          <path d="M0 80 Q150 72 300 78 Q450 84 600 74 Q750 68 900 76 Q1050 82 1200 72 Q1350 66 1440 74" stroke="#4CAF50" strokeWidth="1" fill="none" opacity="0.2" />
        </svg>
      </div>

      {/* 小溪 */}
      <svg className="absolute bottom-[5%] left-[2%] w-[96%] h-[8%]" viewBox="0 0 1400 70" preserveAspectRatio="none">
        <defs>
          <linearGradient id="stream-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#80DEEA" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#4DD0E1" stopOpacity="0.4" />
          </linearGradient>
        </defs>
        {/* 溪流主体 */}
        <path d="M-20 40 Q120 55 280 35 Q440 15 600 38 Q760 58 920 30 Q1080 8 1240 35 Q1350 50 1420 38"
          fill="none" stroke="url(#stream-water)" strokeWidth="14" strokeLinecap="round" />
        {/* 水面高光 */}
        <path d="M50 38 Q180 52 320 33 Q460 16 620 36 Q780 55 940 28 Q1100 8 1260 33"
          fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.3" strokeDasharray="12 28" className="stream-shimmer" />
        <path d="M100 42 Q230 54 380 37 Q520 22 680 40"
          fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" strokeDasharray="6 18" className="stream-shimmer" style={{ animationDelay: '1.5s' }} />
        {/* 溪边卵石 */}
        <ellipse cx="250" cy="43" rx="6" ry="3.5" fill="#8D6E63" opacity="0.4" />
        <ellipse cx="600" cy="35" rx="5" ry="3" fill="#A1887F" opacity="0.35" />
        <ellipse cx="950" cy="32" rx="7" ry="4" fill="#8D6E63" opacity="0.4" />
        <ellipse cx="1200" cy="37" rx="4" ry="2.5" fill="#BCAAA4" opacity="0.3" />
      </svg>

      {/* 栅栏（左侧，带微摆动） */}
      <svg className="absolute bottom-[20%] left-[2%] w-[20%] h-[10%]" viewBox="0 0 280 100">
        {[0, 38, 76, 114, 152, 190, 228, 266].map((x, i) => (
          <rect key={i} x={x} y={22} width="7" height="58" rx="2" fill="#8D6E63" />
        ))}
        <rect x="0" y="36" width="275" height="5.5" rx="2" fill="#A1887F" />
        <rect x="0" y="56" width="275" height="5.5" rx="2" fill="#A1887F" />
        {[0, 38, 76, 114, 152, 190, 228, 266].map((x, i) => (
          <polygon key={`t${i}`} points={`${x + 3.5},22 ${x},13 ${x + 7},13`} fill="#795548" />
        ))}
      </svg>

      {/* 栅栏（右侧） */}
      <svg className="absolute bottom-[18%] right-[2%] w-[16%] h-[9%]" viewBox="0 0 220 85">
        {[0, 35, 70, 105, 140, 175].map((x, i) => (
          <rect key={i} x={x + 2} y={18} width="6" height="50" rx="2" fill="#8D6E63" />
        ))}
        <rect x="0" y="30" width="185" height="5" rx="2" fill="#A1887F" />
        <rect x="0" y="48" width="185" height="5" rx="2" fill="#A1887F" />
        {[0, 35, 70, 105, 140, 175].map((x, i) => (
          <polygon key={`t${i}`} points={`${x + 5},18 ${x + 2},10 ${x + 8},10`} fill="#795548" />
        ))}
      </svg>

      {/* 草丛装饰（有摇摆动画） */}
      {[[3, 68, 1.8], [12, 70, 1.5], [88, 69, 1.6], [95, 71, 1.4], [45, 73, 1.3], [55, 72, 1.5]].map(([x, y, s], i) => (
        <svg key={`grass${i}`} className="absolute sway-slow" style={{ left: `${x}%`, top: `${y}%`, width: `${(s as number) * 2}%`, height: `${(s as number) * 3}%`, animationDelay: `${i * 1.2}s` }} viewBox="0 0 40 50">
          <path d="M15 48 Q13 35 10 22 Q8 15 12 8" stroke="#43A047" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M20 48 Q20 32 20 18 Q20 10 22 4" stroke="#66BB6A" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M25 48 Q27 36 30 24 Q32 16 28 9" stroke="#388E3C" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      ))}

      {/* 地面小花（带微摆） */}
      {[[5, 71, '#F48FB1', '#EC407A'], [14, 73, '#FFF9C4', '#FFD54F'], [25, 72, 'white', '#FFF59D'], [38, 74, '#E1BEE7', '#CE93D8'], [62, 71, '#BBDEFB', '#64B5F6'], [75, 73, '#F8BBD0', '#F06292'], [86, 72, '#FFF9C4', '#FFC107'], [94, 74, 'white', '#FFD54F']].map(([x, y, c1, c2], i) => (
        <svg key={`fl${i}`} className="absolute sway-slow" style={{ left: `${x}%`, top: `${y}%`, width: '12px', height: '16px', animationDelay: `${i * 0.8}s`, animationDuration: '4s' }} viewBox="0 0 14 18">
          <path d="M7 18 L7 10" stroke="#4CAF50" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="7" cy="7" r="4" fill={c1 as string} />
          <circle cx="7" cy="7" r="1.8" fill={c2 as string} />
        </svg>
      ))}

      {/* 蝴蝶（浮动动画） */}
      <svg className="absolute top-[35%] left-[15%] w-[2.5%] h-[3%] butterfly-float" viewBox="0 0 30 24">
        <path d="M15 12 Q8 5 4 8 Q2 12 8 14 Q12 15 15 12" fill="#CE93D8" opacity="0.85" />
        <path d="M15 12 Q22 5 26 8 Q28 12 22 14 Q18 15 15 12" fill="#BA68C8" opacity="0.85" />
        <path d="M15 12 Q11 16 9 19 Q12 18 15 14" fill="#E1BEE7" opacity="0.7" />
        <path d="M15 12 Q19 16 21 19 Q18 18 15 14" fill="#CE93D8" opacity="0.7" />
        <line x1="15" y1="8" x2="15" y2="18" stroke="#4A148C" strokeWidth="0.8" />
      </svg>
      <svg className="absolute top-[42%] right-[12%] w-[2%] h-[2.5%] butterfly-float" style={{ animationDelay: '3s', animationDuration: '7s' }} viewBox="0 0 30 24">
        <path d="M15 12 Q8 5 4 8 Q2 12 8 14 Q12 15 15 12" fill="#FFB74D" opacity="0.85" />
        <path d="M15 12 Q22 5 26 8 Q28 12 22 14 Q18 15 15 12" fill="#FFA726" opacity="0.85" />
        <path d="M15 12 Q11 16 9 19 Q12 18 15 14" fill="#FFE0B2" opacity="0.7" />
        <path d="M15 12 Q19 16 21 19 Q18 18 15 14" fill="#FFB74D" opacity="0.7" />
        <line x1="15" y1="8" x2="15" y2="18" stroke="#E65100" strokeWidth="0.8" />
      </svg>

      {/* 蜻蜓 */}
      <svg className="absolute top-[25%] left-[65%] w-[3%] h-[2%] dragonfly-float" viewBox="0 0 50 20">
        <ellipse cx="25" cy="10" rx="8" ry="3" fill="#4FC3F7" opacity="0.8" />
        <ellipse cx="15" cy="10" rx="3" ry="1.5" fill="#29B6F6" />
        <path d="M20 7 Q14 2 8 4" stroke="#B3E5FC" strokeWidth="0.8" fill="none" opacity="0.7" />
        <path d="M20 13 Q14 18 8 16" stroke="#B3E5FC" strokeWidth="0.8" fill="none" opacity="0.7" />
        <path d="M30 7 Q36 2 42 4" stroke="#B3E5FC" strokeWidth="0.8" fill="none" opacity="0.7" />
        <path d="M30 13 Q36 18 42 16" stroke="#B3E5FC" strokeWidth="0.8" fill="none" opacity="0.7" />
        <ellipse cx="20" cy="6" rx="8" ry="2.5" fill="#E1F5FE" opacity="0.5" />
        <ellipse cx="20" cy="14" rx="8" ry="2.5" fill="#E1F5FE" opacity="0.5" />
        <ellipse cx="30" cy="6" rx="8" ry="2.5" fill="#E1F5FE" opacity="0.5" />
        <ellipse cx="30" cy="14" rx="8" ry="2.5" fill="#E1F5FE" opacity="0.5" />
      </svg>

      {/* 木牌 —— 班级植物园（立在地面） */}
      <div className="absolute bottom-[4%] right-[4%] z-30" style={{ transform: 'rotate(-2deg)' }}>
        <svg width="180" height="110" viewBox="0 0 180 110">
          {/* 木桩（插入地面） */}
          <rect x="30" y="48" width="7" height="55" rx="2" fill="#5D4037" />
          <rect x="143" y="48" width="7" height="55" rx="2" fill="#5D4037" />
          {/* 地面草丛遮挡 */}
          <ellipse cx="33" cy="100" rx="12" ry="6" fill="#4CAF50" opacity="0.7" />
          <ellipse cx="147" cy="100" rx="12" ry="6" fill="#66BB6A" opacity="0.6" />
          <ellipse cx="90" cy="106" rx="50" ry="5" fill="#2E7D32" opacity="0.2" />
          {/* 木牌主体 */}
          <rect x="8" y="5" width="164" height="48" rx="7" fill="#6D4C41" />
          <rect x="12" y="9" width="156" height="40" rx="5" fill="#8D6E63" />
          <rect x="16" y="12" width="148" height="34" rx="4" fill="#A1887F" />
          {/* 装饰钉 */}
          <circle cx="24" cy="16" r="2.5" fill="#FFD54F" opacity="0.8" />
          <circle cx="156" cy="16" r="2.5" fill="#FFD54F" opacity="0.8" />
          <circle cx="24" cy="42" r="2.5" fill="#FFD54F" opacity="0.8" />
          <circle cx="156" cy="42" r="2.5" fill="#FFD54F" opacity="0.8" />
          {/* 文字 */}
          <text x="90" y="35" textAnchor="middle" fill="#FFF8E1" fontSize="15" fontWeight="bold" fontFamily="'Microsoft YaHei', sans-serif">班级植物园</text>
          {/* 叶子装饰 */}
          <ellipse cx="36" cy="28" rx="4" ry="2.5" fill="#81C784" opacity="0.7" transform="rotate(-20 36 28)" />
          <ellipse cx="144" cy="28" rx="4" ry="2.5" fill="#81C784" opacity="0.7" transform="rotate(20 144 28)" />
        </svg>
      </div>

      {/* 松鼠（在园内跑动） */}
      <motion.svg
        animate={{
          left: SQUIRREL_WAYPOINTS[squirrelIdx].left,
          bottom: SQUIRREL_WAYPOINTS[squirrelIdx].bottom,
        }}
        transition={{ duration: 2.5, ease: 'easeInOut' }}
        className="absolute w-[3%] h-[5%] z-[8]"
        style={{ scaleX: squirrelFlip ? -1 : 1 }}
        viewBox="0 0 40 55"
      >
        <ellipse cx="20" cy="38" rx="9" ry="12" fill="#8D6E63" />
        <circle cx="20" cy="22" r="8" fill="#A1887F" />
        <circle cx="14" cy="16" r="3.5" fill="#8D6E63" />
        <circle cx="26" cy="16" r="3.5" fill="#8D6E63" />
        <circle cx="14" cy="16" r="1.8" fill="#BCAAA4" />
        <circle cx="26" cy="16" r="1.8" fill="#BCAAA4" />
        <circle cx="17" cy="21" r="2" fill="#3E2723" />
        <circle cx="23" cy="21" r="2" fill="#3E2723" />
        <circle cx="17.5" cy="20.3" r="0.8" fill="white" />
        <circle cx="23.5" cy="20.3" r="0.8" fill="white" />
        <ellipse cx="20" cy="25" rx="1.8" ry="1" fill="#5D4037" />
        <path d="M27 34 Q38 25 35 14 Q32 8 27 13" stroke="#6D4C41" strokeWidth="5" fill="none" strokeLinecap="round" />
        <ellipse cx="20" cy="40" rx="5" ry="7" fill="#D7CCC8" />
        <ellipse cx="15" cy="44" rx="3" ry="4" fill="#6D4C41" />
        <ellipse cx="25" cy="44" rx="3" ry="4" fill="#6D4C41" />
      </motion.svg>
    </div>
  )
}

// ============ 动画特效 ============

function WaterEffect() {
  const drops = useMemo(() => Array.from({ length: 8 }, (_, i) => ({
    x: 20 + Math.random() * 60,
    delay: i * 0.04,
  })), [])
  return (
    <motion.div className="absolute inset-0 pointer-events-none z-10" exit={{ opacity: 0 }}>
      {drops.map((d, i) => (
        <motion.div
          key={i}
          className="absolute w-[3px] h-4 rounded-full bg-gradient-to-b from-sky-300 to-blue-400"
          style={{ left: `${d.x}%`, top: '10%' }}
          initial={{ y: 0, opacity: 0.9 }}
          animate={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.6, delay: d.delay, ease: 'easeIn' }}
        />
      ))}
    </motion.div>
  )
}

function SunlightEffect() {
  return (
    <motion.div className="absolute inset-0 pointer-events-none z-10" exit={{ opacity: 0 }}>
      <motion.div
        className="absolute inset-0 rounded-lg"
        style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(255,236,179,0.6) 0%, transparent 60%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 1.2 }}
      />
    </motion.div>
  )
}

function FertilizeEffect() {
  const particles = useMemo(() => Array.from({ length: 8 }, (_, i) => ({
    x: 25 + Math.random() * 50,
    dy: -(30 + Math.random() * 30),
    delay: i * 0.04,
    color: ['#81C784', '#A5D6A7', '#66BB6A'][i % 3],
  })), [])
  return (
    <motion.div className="absolute inset-0 pointer-events-none z-10" exit={{ opacity: 0 }}>
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full"
          style={{ left: `${p.x}%`, bottom: '20%', background: p.color }}
          initial={{ y: 0, opacity: 0.9 }}
          animate={{ y: p.dy, opacity: 0 }}
          transition={{ duration: 0.8, delay: p.delay, ease: 'easeOut' }}
        />
      ))}
    </motion.div>
  )
}

function PesticideEffect() {
  return (
    <motion.div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center" exit={{ opacity: 0 }}>
      <motion.div
        className="w-16 h-16 rounded-full"
        style={{ border: '2px solid rgba(186,104,200,0.6)', boxShadow: '0 0 12px rgba(186,104,200,0.3)' }}
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: [0.3, 1.1, 1], opacity: [0, 0.8, 0] }}
        transition={{ duration: 0.8 }}
      />
    </motion.div>
  )
}

function LevelUpEffect() {
  return (
    <motion.div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center" exit={{ opacity: 0 }}>
      {Array.from({ length: 10 }, (_, i) => {
        const angle = (i / 10) * Math.PI * 2
        const colors = ['#FFD700', '#FFA726', '#FFEB3B', '#81C784']
        return (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{ background: colors[i % 4], left: '50%', top: '45%' }}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
            animate={{ x: Math.cos(angle) * 40, y: Math.sin(angle) * 40, scale: [0, 1.5, 0], opacity: [1, 1, 0] }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        )
      })}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.1, 1], opacity: [0, 1, 1] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="text-xs font-bold text-amber-600 bg-white/95 px-3 py-1 rounded-full shadow-md border border-amber-200"
      >
        升级!
      </motion.div>
    </motion.div>
  )
}

const EFFECT_MAP: Record<TreeActionType, React.FC> = {
  water: WaterEffect,
  sunlight: SunlightEffect,
  fertilize: FertilizeEffect,
  pesticide: PesticideEffect,
}


// ============ 果实图标 ============

function FruitIcon({ species, size = 28 }: { species: number; size?: number }) {
  const fruits = [
    // 0: 樱花 → 樱桃
    <svg key={0} viewBox="0 0 32 32" width={size} height={size}>
      <path d="M16 6 Q14 4 16 2 Q18 4 16 6" stroke="#388E3C" strokeWidth="1.5" fill="none" />
      <circle cx="12" cy="18" r="7" fill="#E91E63" />
      <circle cx="20" cy="20" r="6.5" fill="#C2185B" />
      <circle cx="11" cy="16" r="2" fill="#F48FB1" opacity="0.6" />
      <circle cx="19" cy="18" r="1.8" fill="#F48FB1" opacity="0.5" />
    </svg>,
    // 1: 向日葵 → 葵花籽盘
    <svg key={1} viewBox="0 0 32 32" width={size} height={size}>
      <circle cx="16" cy="16" r="10" fill="#5D4037" />
      <circle cx="16" cy="16" r="8" fill="#795548" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
        <circle key={i} cx={16 + Math.cos(i * Math.PI / 4) * 5} cy={16 + Math.sin(i * Math.PI / 4) * 5} r="1.5" fill="#FFD54F" />
      ))}
    </svg>,
    // 2: 竹子 → 竹笋
    <svg key={2} viewBox="0 0 32 32" width={size} height={size}>
      <path d="M16 28 Q12 20 13 12 Q14 6 16 3 Q18 6 19 12 Q20 20 16 28" fill="#8BC34A" />
      <path d="M13 18 Q16 16 19 18" stroke="#689F38" strokeWidth="0.8" fill="none" />
      <path d="M13.5 13 Q16 11 18.5 13" stroke="#689F38" strokeWidth="0.8" fill="none" />
      <path d="M14.5 8 Q16 7 17.5 8" stroke="#689F38" strokeWidth="0.8" fill="none" />
    </svg>,
    // 3: 梅花 → 青梅
    <svg key={3} viewBox="0 0 32 32" width={size} height={size}>
      <circle cx="16" cy="17" r="9" fill="#C0CA33" />
      <circle cx="16" cy="17" r="7.5" fill="#CDDC39" />
      <circle cx="14" cy="14" r="2.5" fill="#DCE775" opacity="0.6" />
      <path d="M16 6 Q15 4 16 2" stroke="#558B2F" strokeWidth="1.2" fill="none" />
      <ellipse cx="17" cy="5" rx="2.5" ry="1.5" fill="#66BB6A" />
    </svg>,
    // 4: 薰衣草 → 薰衣草束
    <svg key={4} viewBox="0 0 32 32" width={size} height={size}>
      <path d="M14 28 Q14 20 14 12" stroke="#558B2F" strokeWidth="1.5" fill="none" />
      <path d="M18 28 Q18 20 18 14" stroke="#558B2F" strokeWidth="1.5" fill="none" />
      <path d="M16 28 Q16 18 16 10" stroke="#558B2F" strokeWidth="1.5" fill="none" />
      <ellipse cx="14" cy="8" rx="2.5" ry="5" fill="#7B1FA2" />
      <ellipse cx="18" cy="10" rx="2.5" ry="5" fill="#9C27B0" />
      <ellipse cx="16" cy="6" rx="2.5" ry="5.5" fill="#6A1B9A" />
    </svg>,
    // 5: 银杏 → 银杏果
    <svg key={5} viewBox="0 0 32 32" width={size} height={size}>
      <ellipse cx="16" cy="18" rx="7" ry="8" fill="#FFB300" />
      <ellipse cx="16" cy="18" rx="5.5" ry="6.5" fill="#FFC107" />
      <circle cx="14" cy="15" r="2" fill="#FFD54F" opacity="0.5" />
      <path d="M16 8 Q15 6 16 4" stroke="#558B2F" strokeWidth="1.2" fill="none" />
    </svg>,
    // 6: 橘子树 → 橘子
    <svg key={6} viewBox="0 0 32 32" width={size} height={size}>
      <circle cx="16" cy="17" r="9" fill="#E64A19" />
      <circle cx="16" cy="17" r="7.5" fill="#FF5722" />
      <circle cx="13" cy="14" r="2.5" fill="#FF8A65" opacity="0.5" />
      <path d="M16 7 Q15 5 16 3" stroke="#388E3C" strokeWidth="1.5" fill="none" />
      <ellipse cx="17" cy="5" rx="3" ry="1.8" fill="#4CAF50" />
    </svg>,
    // 7: 玫瑰 → 玫瑰果
    <svg key={7} viewBox="0 0 32 32" width={size} height={size}>
      <ellipse cx="16" cy="18" rx="6" ry="7.5" fill="#C62828" />
      <ellipse cx="16" cy="18" rx="4.5" ry="6" fill="#E53935" />
      <circle cx="14" cy="15" r="1.8" fill="#EF5350" opacity="0.5" />
      <path d="M16 9 Q15 7 16 5" stroke="#388E3C" strokeWidth="1.2" fill="none" />
      <path d="M14 6 Q16 4 18 6" stroke="#388E3C" strokeWidth="1" fill="none" />
    </svg>,
  ]
  return fruits[species] || fruits[0]
}

// ============ 采摘篮（拟物场景元素）============

function HarvestBasket({ trees }: { trees: TreeWithGroup[] }) {
  const [expanded, setExpanded] = useState(false)
  const totalHarvested = trees.reduce((s, t) => s + (t.redeemed_t1 || 0) + (t.redeemed_t2 || 0) + (t.redeemed_t3 || 0), 0)

  if (totalHarvested === 0) return null

  const basketFruits: { species: number; tier: 1 | 2 | 3; key: string }[] = []
  trees.forEach((t, i) => {
    for (let n = 0; n < (t.redeemed_t1 || 0); n++) basketFruits.push({ species: i, tier: 1, key: `${i}-t1-${n}` })
    for (let n = 0; n < (t.redeemed_t2 || 0); n++) basketFruits.push({ species: i, tier: 2, key: `${i}-t2-${n}` })
    for (let n = 0; n < (t.redeemed_t3 || 0); n++) basketFruits.push({ species: i, tier: 3, key: `${i}-t3-${n}` })
  })

  const fruitSlots: [number, number][] = [
    [50, 56], [75, 54], [100, 56], [125, 54], [150, 56],
    [58, 72], [83, 70], [108, 72], [133, 70], [155, 72],
    [68, 86], [98, 84],
  ]

  const totalT1 = trees.reduce((s, t) => s + (t.redeemed_t1 || 0), 0)
  const totalT2 = trees.reduce((s, t) => s + (t.redeemed_t2 || 0), 0)
  const totalT3 = trees.reduce((s, t) => s + (t.redeemed_t3 || 0), 0)

  return (
    <>
      {/* 小篮子 */}
      <div
        className="absolute bottom-[3%] left-[3%] z-[35] cursor-pointer hover:scale-105 transition-transform"
        onClick={e => { e.stopPropagation(); setExpanded(true) }}
        title="点击查看详情"
      >
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[80%] h-2 bg-black/8 rounded-[50%] blur-sm" />
        <svg viewBox="0 0 200 130" width={120} height={80} className="relative">
          <path d="M30 45 Q28 42 30 40 L170 40 Q172 42 170 45 L160 110 Q158 115 150 115 L50 115 Q42 115 40 110 Z" fill="#C8A06E" />
          <path d="M30 45 L170 45 L160 110 Q158 115 150 115 L50 115 Q42 115 40 110 Z" fill="#D4A574" />
          {[52, 60, 68, 76, 84, 92, 100, 108].map((y, i) => {
            const shrink = (y - 45) * 0.12
            return <path key={i} d={`M${32 + shrink} ${y} L${168 - shrink} ${y}`} stroke="#B08050" strokeWidth="0.8" opacity="0.4" />
          })}
          {[50, 65, 80, 95, 110, 125, 140, 155].map((x, i) => {
            const topX = x
            const botX = x * 0.94 + 6
            return <path key={i} d={`M${topX} 45 L${botX} 112`} stroke="#A07040" strokeWidth="0.6" opacity="0.3" />
          })}
          <path d="M28 40 Q28 36 32 36 L168 36 Q172 36 172 40 L172 46 Q172 48 168 48 L32 48 Q28 48 28 46 Z" fill="#B89060" stroke="#8D6E63" strokeWidth="1" />
          <path d="M30 38 L170 38" stroke="#D4A574" strokeWidth="1" opacity="0.6" />
          <path d="M70 36 Q70 12 100 10 Q130 12 130 36" stroke="#8D6E63" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M70 36 Q70 14 100 12 Q130 14 130 36" stroke="#A1887F" strokeWidth="2" fill="none" strokeLinecap="round" />
          <ellipse cx="100" cy="55" rx="60" ry="10" fill="#E8D5A3" opacity="0.6" />
          {basketFruits.slice(0, 12).map((f, idx) => {
            const [sx, sy] = fruitSlots[idx]
            return (
              <g key={f.key} transform={`translate(${sx - 11}, ${sy - 11}) scale(0.7)`}>
                <FruitSvgInline species={f.species} tier={f.tier} />
              </g>
            )
          })}
          <g>
            <rect x="150" y="20" width="36" height="18" rx="9" fill="#E53935" opacity="0.9" />
            <text x="168" y="33" textAnchor="middle" fontSize="11" fontWeight="bold" fill="white">{totalHarvested}</text>
          </g>
        </svg>
      </div>

      {/* 点击放大详情面板 */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[80] flex items-center justify-center bg-black/30 backdrop-blur-sm"
            onClick={(e) => { e.stopPropagation(); setExpanded(false) }}
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.7, opacity: 0 }}
              transition={{ type: 'spring', damping: 20 }}
              className="bg-amber-50 rounded-2xl shadow-2xl border-2 border-amber-300 p-6 max-w-lg w-[90%] max-h-[80%] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-amber-900">🧺 收获篮</h2>
                <button onClick={() => setExpanded(false)} className="text-stone-400 hover:text-stone-600 text-xl">✕</button>
              </div>

              {/* 总汇总 */}
              <div className="flex gap-4 mb-4 p-3 bg-white/60 rounded-xl">
                <span className="text-sm text-stone-600">共 <strong className="text-amber-800">{totalHarvested}</strong> 个果实</span>
                <div className="flex gap-3 text-xs font-semibold">
                  {totalT1 > 0 && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ background: '#CD7F32' }} />铜果 ×{totalT1}</span>}
                  {totalT2 > 0 && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ background: '#C0C0C0' }} />银果 ×{totalT2}</span>}
                  {totalT3 > 0 && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ background: '#FFD700' }} />金果 ×{totalT3}</span>}
                </div>
              </div>

              {/* 各组详细 */}
              <div className="space-y-3">
                {trees.map((tree, i) => {
                  const t1 = tree.redeemed_t1 || 0
                  const t2 = tree.redeemed_t2 || 0
                  const t3 = tree.redeemed_t3 || 0
                  const total = t1 + t2 + t3
                  if (total === 0) return null
                  return (
                    <div key={tree.id} className="flex items-center gap-3 p-2.5 bg-white/80 rounded-xl border border-amber-100">
                      {/* 小组果实图标 */}
                      <div className="flex-shrink-0">
                        <svg viewBox="0 0 32 32" width={36} height={36}>
                          <FruitSvgInline species={i} />
                        </svg>
                      </div>
                      {/* 小组名 */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-stone-700 truncate">{tree.group_name}</div>
                        <div className="flex gap-3 mt-1">
                          {t1 > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: '#CD7F32' }}>铜</span>
                              <span className="text-xs font-semibold text-stone-600">×{t1}</span>
                            </div>
                          )}
                          {t2 > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: '#A0A0A0' }}>银</span>
                              <span className="text-xs font-semibold text-stone-600">×{t2}</span>
                            </div>
                          )}
                          {t3 > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: '#DAA520' }}>金</span>
                              <span className="text-xs font-semibold text-stone-600">×{t3}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* 总数 */}
                      <div className="text-right">
                        <span className="text-lg font-bold text-amber-700">{total}</span>
                        <span className="text-[10px] text-stone-400 block">个</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function FruitSvgInline({ species, tier }: { species: number; tier?: 1 | 2 | 3 }) {
  const fruit = (() => {
    switch (species) {
      case 0: return <><circle cx="16" cy="18" r="6" fill="#E91E63" /><circle cx="14" cy="16" r="1.5" fill="#F48FB1" opacity="0.6" /></>
      case 1: return <><circle cx="16" cy="16" r="6" fill="#5D4037" /><circle cx="16" cy="16" r="4" fill="#795548" /></>
      case 2: return <><path d="M16 24 Q13 18 14 12 Q15 8 16 6 Q17 8 18 12 Q19 18 16 24" fill="#8BC34A" /></>
      case 3: return <><circle cx="16" cy="17" r="6" fill="#CDDC39" /><circle cx="14" cy="15" r="1.8" fill="#DCE775" opacity="0.5" /></>
      case 4: return <><ellipse cx="16" cy="14" rx="3" ry="6" fill="#7B1FA2" /><path d="M16 20 L16 26" stroke="#558B2F" strokeWidth="1.5" /></>
      case 5: return <><ellipse cx="16" cy="16" rx="5" ry="6" fill="#FFC107" /><circle cx="14" cy="14" r="1.5" fill="#FFD54F" opacity="0.5" /></>
      case 6: return <><circle cx="16" cy="16" r="6" fill="#FF5722" /><circle cx="14" cy="14" r="2" fill="#FF8A65" opacity="0.4" /></>
      case 7: return <><ellipse cx="16" cy="16" rx="5" ry="6" fill="#E53935" /><circle cx="14" cy="14" r="1.5" fill="#EF5350" opacity="0.5" /></>
      default: return <circle cx="16" cy="16" r="5" fill="#9E9E9E" />
    }
  })()

  if (!tier) return <>{fruit}</>

  if (tier === 1) {
    return <>
      <circle cx="16" cy="16" r="12" fill="#CD7F32" opacity="0.25" />
      {fruit}
      <circle cx="16" cy="16" r="11" fill="none" stroke="#CD7F32" strokeWidth="2.5" />
      <text x="16" y="30" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#8B5E3C">铜</text>
    </>
  }
  if (tier === 2) {
    return <>
      <circle cx="16" cy="16" r="12" fill="#C0C0C0" opacity="0.3" />
      {fruit}
      <circle cx="16" cy="16" r="11" fill="none" stroke="#A0A0A0" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="12.5" fill="none" stroke="#E8E8E8" strokeWidth="1" opacity="0.6" />
      <text x="16" y="30" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#707070">银</text>
    </>
  }
  // tier === 3 金果
  return <>
    <circle cx="16" cy="16" r="14" fill="#FFD700" opacity="0.15" className="animate-pulse" />
    <circle cx="16" cy="16" r="12" fill="#FFF8DC" opacity="0.3" />
    {fruit}
    <circle cx="16" cy="16" r="11" fill="none" stroke="#FFD700" strokeWidth="3" />
    <circle cx="16" cy="16" r="13.5" fill="none" stroke="#FFD700" strokeWidth="1.5" opacity="0.5" />
    <text x="16" y="30" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#B8860B">金</text>
    {/* 闪光星 */}
    <path d="M25 6 L26 9 L29 9 L26.5 11 L27.5 14 L25 12 L22.5 14 L23.5 11 L21 9 L24 9 Z" fill="#FFD700" opacity="0.8" />
  </>
}

// ============ 铭牌预览 + CSS动画 ============

const NAMEPLATE_CSS = `
@keyframes nameplate-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
@keyframes nameplate-glow-shift {
  0% { filter: hue-rotate(0deg) brightness(1); }
  50% { filter: hue-rotate(15deg) brightness(1.3); }
  100% { filter: hue-rotate(0deg) brightness(1); }
}
@keyframes nameplate-border-flame {
  0% { box-shadow: 0 0 8px #ff4500, 0 0 16px #ff450060, inset 0 0 4px #ff450030; }
  33% { box-shadow: 0 0 12px #ff6347, 0 0 24px #ff634760, inset 0 0 6px #ff450040; }
  66% { box-shadow: 0 0 10px #ff8c00, 0 0 20px #ff8c0060, inset 0 0 5px #ff8c0030; }
  100% { box-shadow: 0 0 8px #ff4500, 0 0 16px #ff450060, inset 0 0 4px #ff450030; }
}
@keyframes nameplate-border-frost {
  0% { box-shadow: 0 0 8px #87ceeb, 0 0 16px #87ceeb60, inset 0 0 4px #87ceeb30; }
  50% { box-shadow: 0 0 14px #add8e6, 0 0 28px #add8e660, inset 0 0 8px #87ceeb40; }
  100% { box-shadow: 0 0 8px #87ceeb, 0 0 16px #87ceeb60, inset 0 0 4px #87ceeb30; }
}
@keyframes nameplate-border-lightning {
  0%, 90% { box-shadow: 0 0 8px #9b59b6, 0 0 16px #9b59b660; }
  92% { box-shadow: 0 0 20px #fff, 0 0 40px #9b59b6, 0 0 60px #9b59b660; }
  95% { box-shadow: 0 0 8px #9b59b6, 0 0 16px #9b59b660; }
  97% { box-shadow: 0 0 16px #e8daef, 0 0 32px #9b59b680; }
  100% { box-shadow: 0 0 8px #9b59b6, 0 0 16px #9b59b660; }
}
@keyframes nameplate-border-starfield {
  0% { box-shadow: 0 0 8px #ffeaa7, 0 0 16px #ffeaa740; }
  25% { box-shadow: 0 0 12px #ffeaa7, 0 0 24px #ffeaa760, 2px -2px 6px #fff; }
  50% { box-shadow: 0 0 8px #ffeaa7, 0 0 16px #ffeaa740; }
  75% { box-shadow: 0 0 12px #ffeaa7, 0 0 24px #ffeaa760, -2px 2px 6px #fff; }
  100% { box-shadow: 0 0 8px #ffeaa7, 0 0 16px #ffeaa740; }
}
@keyframes nameplate-legendary-glow {
  0% { transform: scale(1); filter: brightness(1); }
  25% { transform: scale(1.02); filter: brightness(1.2); }
  50% { transform: scale(1); filter: brightness(1.1); }
  75% { transform: scale(1.01); filter: brightness(1.3); }
  100% { transform: scale(1); filter: brightness(1); }
}
.nameplate-flame > div { animation: nameplate-border-flame 1.5s ease-in-out infinite; }
.nameplate-frost > div { animation: nameplate-border-frost 2s ease-in-out infinite; }
.nameplate-lightning > div { animation: nameplate-border-lightning 2.5s ease-in-out infinite; }
.nameplate-starfield > div { animation: nameplate-border-starfield 3s ease-in-out infinite; }
.nameplate-legendary { animation: nameplate-legendary-glow 2s ease-in-out infinite; }
.nameplate-legendary > div { animation: nameplate-border-flame 1.2s ease-in-out infinite; }
@keyframes tree-particle-float {
  0% { transform: translate(var(--px), var(--py)) scale(1); opacity: 0.9; }
  50% { transform: translate(calc(var(--px) + var(--dx)), calc(var(--py) + var(--dy))) scale(0.5); opacity: 0.3; }
  100% { transform: translate(var(--px), var(--py)) scale(1); opacity: 0.9; }
}
@keyframes tree-glow-pulse {
  0%, 100% { opacity: 0.12; transform: scale(1); }
  50% { opacity: 0.28; transform: scale(1.06); }
}
@keyframes companion-hover {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
@keyframes companion-sway {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(3deg); }
}
.tree-particle { animation: tree-particle-float var(--dur) ease-in-out infinite; animation-delay: var(--delay); }
.tree-glow { animation: tree-glow-pulse 3s ease-in-out infinite; }
.companion-fly { animation: companion-hover 2s ease-in-out infinite; }
.companion-sit { animation: companion-sway 3s ease-in-out infinite; transform-origin: bottom center; }
`

function NameplatePreview({ text, styleId }: { text: string; styleId?: string }) {
  const style = treeApi.NAMEPLATE_STYLES.find(s => s.id === styleId)
  const baseStyle: React.CSSProperties = {
    background: style?.gradient || 'linear-gradient(135deg, #3e2723, #5d4037)',
    border: `2.5px solid ${style?.borderColor || '#8d6e63'}`,
    color: style?.textColor || '#fff',
    boxShadow: style?.glow || '0 2px 6px rgba(0,0,0,0.3)',
    padding: '6px 16px',
    borderRadius: '8px',
    fontWeight: 'bold',
    fontSize: '14px',
    letterSpacing: '2px',
    whiteSpace: 'nowrap' as const,
  }
  const animClass = style?.animation === 'flame' ? 'nameplate-flame'
    : style?.animation === 'frost' ? 'nameplate-frost'
    : style?.animation === 'lightning' ? 'nameplate-lightning'
    : style?.animation === 'starfield' ? 'nameplate-starfield'
    : style?.animation === 'legendary' ? 'nameplate-legendary'
    : ''
  return (
    <div className={animClass}>
      <div style={baseStyle}>{text}</div>
    </div>
  )
}

// ============ 高级植物特效 ============

const PARTICLE_SEEDS = [
  [{ x: -20, y: -30, dx: 15, dy: -20 }, { x: 25, y: -45, dx: -10, dy: -15 }, { x: -10, y: -60, dx: 20, dy: 10 }, { x: 30, y: -20, dx: -15, dy: -25 }, { x: -30, y: -50, dx: 10, dy: 15 }, { x: 15, y: -70, dx: -20, dy: 10 }],
  [{ x: 20, y: -25, dx: -12, dy: -18 }, { x: -15, y: -55, dx: 18, dy: 12 }, { x: 35, y: -40, dx: -8, dy: -22 }, { x: -25, y: -35, dx: 14, dy: -10 }, { x: 10, y: -65, dx: -16, dy: 8 }, { x: -5, y: -15, dx: 12, dy: -20 }],
]

function FloatingParticles({ species }: { species: number }) {
  const color = SPECIES[species].accent
  const seeds = PARTICLE_SEEDS[species % 2]
  return (
    <>
      {seeds.map((s, i) => (
        <div
          key={i}
          className="absolute tree-particle rounded-full"
          style={{
            width: 5 + (i % 3),
            height: 5 + (i % 3),
            background: color,
            left: '50%',
            top: '50%',
            '--px': `${s.x}px`,
            '--py': `${s.y}px`,
            '--dx': `${s.dx}px`,
            '--dy': `${s.dy}px`,
            '--dur': `${2.5 + i * 0.4}s`,
            '--delay': `${i * 0.3}s`,
            boxShadow: `0 0 4px ${color}`,
          } as React.CSSProperties}
        />
      ))}
    </>
  )
}

function GlowAura({ species }: { species: number }) {
  const color = SPECIES[species].accent
  return (
    <div
      className="absolute inset-[-20%] tree-glow rounded-full"
      style={{ background: `radial-gradient(circle, ${color}30 0%, transparent 70%)` }}
    />
  )
}

function CompanionAnimal({ species }: { species: number }) {
  const animals: Record<number, React.ReactNode> = {
    0: ( // 粉蝶
      <svg viewBox="0 0 30 24" className="w-7 h-6 companion-fly absolute -top-[15%] right-[-10%]">
        <path d="M15 12 Q8 4 3 8 Q6 14 15 12" fill="#F48FB1" opacity="0.9" />
        <path d="M15 12 Q22 4 27 8 Q24 14 15 12" fill="#F8BBD0" opacity="0.9" />
        <path d="M15 12 Q10 16 6 20 Q10 18 15 14" fill="#F48FB1" opacity="0.7" />
        <path d="M15 12 Q20 16 24 20 Q20 18 15 14" fill="#F8BBD0" opacity="0.7" />
        <ellipse cx="15" cy="13" rx="1" ry="3" fill="#5D4037" />
        <line x1="14" y1="10" x2="12" y2="7" stroke="#5D4037" strokeWidth="0.5" />
        <line x1="16" y1="10" x2="18" y2="7" stroke="#5D4037" strokeWidth="0.5" />
      </svg>
    ),
    1: ( // 蜜蜂
      <svg viewBox="0 0 28 22" className="w-6 h-5 companion-fly absolute -top-[10%] right-[-5%]">
        <ellipse cx="14" cy="13" rx="6" ry="5" fill="#FFC107" />
        <rect x="9" y="11" width="10" height="2" fill="#5D4037" />
        <rect x="9" y="14" width="10" height="1.5" fill="#5D4037" />
        <ellipse cx="10" cy="8" rx="4" ry="3" fill="#BBDEFB" opacity="0.6" />
        <ellipse cx="18" cy="8" rx="4" ry="3" fill="#BBDEFB" opacity="0.6" />
        <circle cx="7" cy="13" r="1.5" fill="#5D4037" />
        <circle cx="6" cy="12" r="0.8" fill="white" />
      </svg>
    ),
    2: ( // 小熊猫
      <svg viewBox="0 0 32 36" className="w-8 h-9 companion-sit absolute bottom-[5%] right-[-15%]">
        <ellipse cx="16" cy="30" rx="9" ry="6" fill="#D84315" />
        <circle cx="16" cy="18" r="8" fill="#E64A19" />
        <circle cx="12" cy="15" r="3.5" fill="#FFF3E0" />
        <circle cx="20" cy="15" r="3.5" fill="#FFF3E0" />
        <circle cx="12" cy="15" r="1.5" fill="#3E2723" />
        <circle cx="20" cy="15" r="1.5" fill="#3E2723" />
        <ellipse cx="16" cy="19" rx="2" ry="1.2" fill="#3E2723" />
        <ellipse cx="9" cy="10" rx="3" ry="4" fill="#5D4037" />
        <ellipse cx="23" cy="10" rx="3" ry="4" fill="#5D4037" />
        <path d="M24 28 Q28 24 30 28 Q28 32 24 30" fill="#D84315" />
      </svg>
    ),
    3: ( // 喜鹊
      <svg viewBox="0 0 30 26" className="w-7 h-6 companion-sit absolute -top-[20%] left-[10%]">
        <ellipse cx="15" cy="16" rx="7" ry="5" fill="#263238" />
        <circle cx="12" cy="11" r="5" fill="#37474F" />
        <ellipse cx="15" cy="17" rx="4" ry="3" fill="white" />
        <circle cx="10" cy="10" r="1.2" fill="white" />
        <circle cx="10" cy="10" r="0.6" fill="black" />
        <path d="M8 11 L5 10 L8 12" fill="#FF8F00" />
        <path d="M20 18 Q26 20 28 24" stroke="#263238" strokeWidth="2" fill="none" />
        <line x1="13" y1="21" x2="12" y2="25" stroke="#FF8F00" strokeWidth="1" />
        <line x1="17" y1="21" x2="18" y2="25" stroke="#FF8F00" strokeWidth="1" />
      </svg>
    ),
    4: ( // 萤火虫群（额外发光粒子）
      <svg viewBox="0 0 40 40" className="w-10 h-10 companion-fly absolute -top-[10%] left-[-5%]">
        {[{x:10,y:12},{x:28,y:8},{x:20,y:25},{x:8,y:30},{x:32,y:28}].map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill="#FFEE58" opacity="0.3" />
            <circle cx={p.x} cy={p.y} r="1.5" fill="#FFF9C4" />
          </g>
        ))}
      </svg>
    ),
    5: ( // 小松鼠
      <svg viewBox="0 0 28 34" className="w-7 h-8 companion-sit absolute bottom-[5%] left-[-12%]">
        <ellipse cx="14" cy="26" rx="6" ry="7" fill="#8D6E63" />
        <circle cx="14" cy="16" r="5.5" fill="#A1887F" />
        <circle cx="12" cy="14.5" r="1.2" fill="#3E2723" />
        <circle cx="16.5" cy="14.5" r="1.2" fill="#3E2723" />
        <ellipse cx="14" cy="17" rx="1.5" ry="1" fill="#5D4037" />
        <ellipse cx="10" cy="11" rx="2" ry="2.5" fill="#8D6E63" />
        <ellipse cx="18" cy="11" rx="2" ry="2.5" fill="#8D6E63" />
        <path d="M18 22 Q24 16 22 10 Q20 14 18 18" fill="#6D4C41" />
        <ellipse cx="14" cy="28" rx="3" ry="2" fill="#FFC107" opacity="0.8" />
      </svg>
    ),
    6: ( // 小猫
      <svg viewBox="0 0 36 28" className="w-9 h-7 companion-sit absolute bottom-[2%] right-[-12%]">
        <ellipse cx="18" cy="20" rx="12" ry="7" fill="#FF8A65" />
        <circle cx="10" cy="14" r="6" fill="#FFAB91" />
        <polygon points="5,8 7,3 10,9" fill="#FF8A65" />
        <polygon points="12,8 14,3 16,9" fill="#FF8A65" />
        <circle cx="8" cy="13" r="1" fill="#3E2723" />
        <circle cx="12" cy="13" r="1" fill="#3E2723" />
        <path d="M9 15 L10 16 L11 15" stroke="#E64A19" strokeWidth="0.7" fill="none" />
        <line x1="5" y1="14" x2="2" y2="13" stroke="#BCAAA4" strokeWidth="0.5" />
        <line x1="5" y1="15" x2="2" y2="15.5" stroke="#BCAAA4" strokeWidth="0.5" />
        <line x1="15" y1="14" x2="18" y2="13" stroke="#BCAAA4" strokeWidth="0.5" />
        <line x1="15" y1="15" x2="18" y2="15.5" stroke="#BCAAA4" strokeWidth="0.5" />
        <path d="M28 18 Q32 14 30 20 Q28 22 28 18" fill="#FF8A65" />
      </svg>
    ),
    7: ( // 蜂鸟
      <svg viewBox="0 0 28 26" className="w-7 h-6 companion-fly absolute -top-[5%] left-[-8%]">
        <ellipse cx="14" cy="14" rx="5" ry="4" fill="#4CAF50" />
        <circle cx="9" cy="11" r="3.5" fill="#388E3C" />
        <circle cx="7.5" cy="10" r="1" fill="white" />
        <circle cx="7.5" cy="10" r="0.5" fill="black" />
        <path d="M6 11 L2 10.5" stroke="#5D4037" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M18 12 Q24 8 26 12 Q22 10 18 14" fill="#81C784" opacity="0.7" />
        <path d="M18 14 Q24 12 26 16 Q22 14 18 16" fill="#A5D6A7" opacity="0.6" />
        <ellipse cx="12" cy="13" rx="2.5" ry="1.5" fill="#E53935" />
      </svg>
    ),
  }
  return <>{animals[species] || null}</>
}

function TreeLevelEffects({ level, species }: { level: number; species: number }) {
  if (level < 4) return null
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      <FloatingParticles species={species} />
      {level >= 5 && <GlowAura species={species} />}
      {level >= 5 && <CompanionAnimal species={species} />}
    </div>
  )
}

// ============ 植物位 ============

function PlantSlot({ tree, species, selected, scale, onSelect, onRedeem, effectType, showLevelUp, thresholds, goldThreshold }: {
  tree: TreeWithGroup
  species: number
  selected: boolean
  scale: number
  onSelect: () => void
  onRedeem: (tier: 1 | 2 | 3, e: React.MouseEvent) => void
  effectType: TreeActionType | null
  showLevelUp: boolean
  thresholds: number[]
  goldThreshold: number
}) {
  const currentThreshold = thresholds[tree.level] || 0
  const nextThreshold = tree.level < treeApi.MAX_LEVEL
    ? thresholds[tree.level + 1]
    : thresholds[treeApi.MAX_LEVEL]
  const progress = tree.level >= treeApi.MAX_LEVEL
    ? ((tree.gold_progress || 0) / goldThreshold) * 100
    : ((tree.growth - currentThreshold) / (nextThreshold - currentThreshold)) * 100
  const availableTiers = [
    tree.fruits_t1 - tree.redeemed_t1,
    tree.fruits_t2 - tree.redeemed_t2,
    tree.fruits_t3 - tree.redeemed_t3,
  ]
  const speciesInfo = SPECIES[species]

  const EffectComp = effectType ? EFFECT_MAP[effectType] : null
  const plantH = (100 + tree.level * 20) * scale

  return (
    <div
      className="relative flex flex-col items-center"
      style={{ width: 200 * scale, transform: `scale(${scale})`, transformOrigin: 'bottom center' }}
    >
      {/* 植物 SVG */}
      <motion.div
        className="relative cursor-pointer tree-sway"
        style={{ width: 170, height: plantH }}
        onClick={(e) => { e.stopPropagation(); onSelect() }}
        whileHover={{ scale: 1.05 }}
        transition={{ type: 'spring', stiffness: 300 }}
      >
        <PlantSvg level={tree.level} species={species} />
        <TreeLevelEffects level={tree.level} species={species} />
        <AnimatePresence>
          {EffectComp && <EffectComp key={effectType} />}
          {showLevelUp && <LevelUpEffect key="levelup" />}
        </AnimatePresence>
      </motion.div>

      {/* 果实按钮（分等级） */}
      {availableTiers.some(n => n > 0) && (
        <div className="absolute top-0 right-0 flex flex-col gap-0.5 z-10">
          {availableTiers.map((count, ti) => count > 0 ? (
            <motion.button
              key={ti}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              onClick={(e) => { e.stopPropagation(); onRedeem((ti + 1) as 1 | 2 | 3, e) }}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold shadow-sm hover:scale-110 transition-transform border"
              style={{
                background: `${treeApi.FRUIT_TIER_COLORS[ti]}20`,
                borderColor: `${treeApi.FRUIT_TIER_COLORS[ti]}60`,
                color: treeApi.FRUIT_TIER_COLORS[ti],
              }}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: treeApi.FRUIT_TIER_COLORS[ti] }} />
              <span>{count}</span>
            </motion.button>
          ) : null)}
        </div>
      )}

      {/* 铭牌渲染 — 紧贴植物上方 */}
      {(() => {
        const decor = treeApi.parseDecorations(tree)
        if (!decor.nameplate) return null
        const style = treeApi.NAMEPLATE_STYLES.find(s => s.id === decor.style)
        const baseStyle: React.CSSProperties = {
          background: style?.gradient || 'linear-gradient(135deg, #3e2723, #5d4037)',
          border: `1.5px solid ${style?.borderColor || '#8d6e63'}`,
          color: style?.textColor || '#fff',
          boxShadow: style?.glow || '0 2px 6px rgba(0,0,0,0.3)',
        }
        const animClass = style?.animation === 'flame' ? 'nameplate-flame'
          : style?.animation === 'frost' ? 'nameplate-frost'
          : style?.animation === 'lightning' ? 'nameplate-lightning'
          : style?.animation === 'starfield' ? 'nameplate-starfield'
          : style?.animation === 'legendary' ? 'nameplate-legendary'
          : ''
        const len = decor.nameplate.length
        const sizeClass = len <= 4 ? 'text-base px-5 py-2 tracking-widest'
          : len <= 6 ? 'text-sm px-4 py-1.5 tracking-wide'
          : 'text-xs px-3 py-1 tracking-normal'
        return (
          <div className={`flex justify-center my-1 z-10 ${animClass}`}>
            <div
              className={`rounded-lg font-black whitespace-nowrap ${sizeClass}`}
              style={baseStyle}
            >
              {decor.nameplate}
            </div>
          </div>
        )
      })()}

      {/* 信息面板 */}
      <div className="w-full mt-1.5 bg-white/80 rounded-lg px-3 py-2.5 shadow-sm border border-white z-10">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-semibold text-stone-700 truncate">{tree.group_name}</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${speciesInfo.accent}30`, color: speciesInfo.dark }}>
            {speciesInfo.name}
          </span>
        </div>
        <div className="w-full h-[5px] bg-black/5 rounded-full overflow-hidden mb-1.5">
          <motion.div
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${speciesInfo.light}, ${speciesInfo.accent}, ${speciesInfo.dark})` }}
            initial={false}
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        <div className="flex justify-between text-xs text-stone-500">
          <span>
            {tree.level >= treeApi.MAX_LEVEL
              ? `Lv${tree.level} · 金果 ${tree.gold_progress || 0}/${goldThreshold}`
              : `Lv${tree.level} · ${tree.growth}/${nextThreshold}`}
          </span>
          <span>{tree.total_score}分</span>
        </div>
      </div>

    </div>
  )
}

// ============ 主页面 ============

export default function TreePage() {
  const [trees, setTrees] = useState<TreeWithGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeEffect, setActiveEffect] = useState<{ treeId: string; type: TreeActionType } | null>(null)
  const [levelUpId, setLevelUpId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [flyingFruits, setFlyingFruits] = useState<{ id: string; x: number; y: number; tier: 1 | 2 | 3; species: number }[]>([])
  const [showDecorPanel, setShowDecorPanel] = useState(false)
  const [decorText, setDecorText] = useState('')
  const [decorStyle, setDecorStyle] = useState<string | undefined>(undefined)
  const [treeSettings, setTreeSettings] = useState<treeApi.TreeSettings>({ thresholds: treeApi.DEFAULT_GROWTH_THRESHOLDS, goldThreshold: treeApi.DEFAULT_GOLD_FRUIT_THRESHOLD })
  const [showSettingsPanel, setShowSettingsPanel] = useState(false)
  const [fruitCelebration, setFruitCelebration] = useState<treeApi.FruitEvent[] | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isTeacher = useMemo(() => isTeacherMode(), [])

  const loadTrees = useCallback(async () => {
    await treeApi.initAllGroupTrees()
    const fruitEvents = await treeApi.syncAllTreeGrowth()
    const data = await treeApi.getAllTrees()
    setTrees(data)
    const settings = await treeApi.getTreeSettings()
    setTreeSettings(settings)
    setLoading(false)
    if (fruitEvents.length > 0) {
      setFruitCelebration(fruitEvents)
    }
  }, [])

  useEffect(() => { loadTrees() }, [loadTrees])

  const selectedTree = trees.find(t => t.id === selectedId)


  const handleRedeem = async (treeId: string, tier: 1 | 2 | 3, e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    const species = trees.findIndex(t => t.id === treeId)
    if (rect) {
      const id = `fly-${Date.now()}`
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      setFlyingFruits(prev => [...prev, { id, x, y, tier, species }])
      setTimeout(() => setFlyingFruits(prev => prev.filter(f => f.id !== id)), 900)
    }
    await treeApi.redeemFruit(treeId, tier)
    await loadTrees()
    const tierName = treeApi.FRUIT_TIER_NAMES[tier - 1]
    setToast(`已摘取${tierName}×1，可找班主任兑换奖励`)
    setTimeout(() => setToast(null), 3000)
  }

  const handleSaveDecor = async (decor: import('@/types').TreeDecorations) => {
    if (!selectedTree) return
    await treeApi.setDecorations(selectedTree.id, decor)
    await loadTrees()
    setToast('装扮已保存')
    setTimeout(() => setToast(null), 2000)
  }

  const backRow = trees.slice(0, 4)
  const frontRow = trees.slice(4, 8)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: 'linear-gradient(180deg, #87CEEB, #A5D6A7)' }}>
        <TreePine className="animate-pulse text-green-600" size={40} />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative h-full overflow-hidden" onClick={() => setSelectedId(null)}>
      <style dangerouslySetInnerHTML={{ __html: NAMEPLATE_CSS }} />
      <FreshBackground />
      <HarvestBasket trees={trees} />

      {/* 教师端设置按钮 */}
      {isTeacher && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowSettingsPanel(true) }}
          className="absolute top-3 right-3 z-50 w-9 h-9 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:bg-white transition-colors border border-stone-200"
          title="植物园设置"
        >
          <Settings size={16} className="text-stone-600" />
        </button>
      )}

      {/* 飞行果实动画 */}
      <AnimatePresence>
        {flyingFruits.map(f => {
          const cw = containerRef.current?.clientWidth || 800
          const ch = containerRef.current?.clientHeight || 600
          const targetX = cw * 0.03 + 60
          const targetY = ch * (1 - 0.03) - 40
          return (
            <motion.div
              key={f.id}
              className="absolute z-[100] pointer-events-none"
              style={{ left: f.x, top: f.y }}
              animate={{ left: targetX, top: targetY, scale: 0.4, opacity: 0.6 }}
              exit={{ opacity: 0, scale: 0.2 }}
              transition={{ duration: 0.7, ease: [0.3, 0.9, 0.3, 1] }}
            >
              <svg viewBox="0 0 32 32" width={36} height={36}>
                <FruitSvgInline species={f.species} tier={f.tier} />
              </svg>
            </motion.div>
          )
        })}
      </AnimatePresence>

      {/* 后排 */}
      <div className="absolute top-[15%] left-0 right-0 flex justify-center items-end gap-[1%] px-[3%] z-10">
        {backRow.map((tree, i) => (
          <PlantSlot
            key={tree.id}
            tree={tree}
            species={i}
            selected={selectedId === tree.id}
            scale={1.0}
            onSelect={() => setSelectedId(prev => prev === tree.id ? null : tree.id)}
            onRedeem={(tier, e) => handleRedeem(tree.id, tier, e)}
            effectType={activeEffect?.treeId === tree.id ? activeEffect.type : null}
            showLevelUp={levelUpId === tree.id}
            thresholds={treeSettings.thresholds}
            goldThreshold={treeSettings.goldThreshold}
          />
        ))}
      </div>

      {/* 前排 */}
      <div className="absolute top-[48%] left-0 right-0 flex justify-center items-end gap-[1.5%] px-[1%] z-20">
        {frontRow.map((tree, i) => (
          <PlantSlot
            key={tree.id}
            tree={tree}
            species={i + 4}
            selected={selectedId === tree.id}
            scale={1.0}
            onSelect={() => setSelectedId(prev => prev === tree.id ? null : tree.id)}
            onRedeem={(tier, e) => handleRedeem(tree.id, tier, e)}
            effectType={activeEffect?.treeId === tree.id ? activeEffect.type : null}
            showLevelUp={levelUpId === tree.id}
            thresholds={treeSettings.thresholds}
            goldThreshold={treeSettings.goldThreshold}
          />
        ))}
      </div>

      {/* 底部固定操作栏 */}
      <AnimatePresence>
        {selectedTree && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white/95 rounded-2xl px-5 py-3 shadow-xl border border-stone-200 z-50"
            onClick={e => e.stopPropagation()}
          >
            <span className="text-sm font-semibold text-stone-700 mr-2">{selectedTree.group_name}</span>
            <span className="text-xs text-stone-500">Lv.{selectedTree.level} {treeApi.LEVEL_NAMES[selectedTree.level]}</span>
            <span className="text-xs text-stone-400">成长值 {selectedTree.growth}</span>
            {selectedTree.level >= 2 && isTeacherMode() && (
              <button
                onClick={() => {
                  const d = treeApi.parseDecorations(selectedTree)
                  setDecorText(d.nameplate || '')
                  setDecorStyle(d.style)
                  setShowDecorPanel(true)
                }}
                className="flex flex-col items-center gap-0.5 w-14 py-1.5 rounded-lg transition-all hover:scale-110 active:scale-95 ml-1 border border-purple-200 bg-purple-50"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-purple-100 border border-purple-300">
                  <Sparkles size={15} className="text-purple-500" />
                </div>
                <span className="text-[9px] text-purple-600 font-semibold">铭牌</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 铭牌定制面板 */}
      <AnimatePresence>
        {showDecorPanel && selectedTree && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => { e.stopPropagation(); setShowDecorPanel(false) }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 22 }}
              className="bg-gradient-to-b from-[#1a1a2e] to-[#16213e] rounded-2xl shadow-2xl border border-indigo-500/30 p-5 w-[480px] max-h-[85%] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-indigo-200">⚡ {selectedTree.group_name} · 铭牌定制</h2>
                <button onClick={() => setShowDecorPanel(false)} className="text-stone-400 hover:text-white text-lg transition-colors">✕</button>
              </div>

              {/* 铭牌文字输入 */}
              <div className="mb-4 p-3 rounded-xl bg-black/30 border border-indigo-500/20">
                <label className="text-xs text-indigo-300 font-medium mb-1.5 block">铭牌文字（最多8字）</label>
                <input
                  type="text"
                  maxLength={8}
                  placeholder="输入你的专属口号..."
                  value={decorText}
                  onChange={e => setDecorText(e.target.value)}
                  className="w-full text-sm bg-black/50 border border-indigo-500/40 rounded-lg px-3 py-2 text-white placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400"
                />
              </div>

              {/* 铭牌预览 */}
              {decorText && (
                <div className="mb-4 flex justify-center py-3 bg-black/20 rounded-xl border border-indigo-500/10">
                  <NameplatePreview text={decorText} styleId={decorStyle} />
                </div>
              )}

              {/* 风格选择 */}
              {[1, 2, 3, 4].map(tier => {
                const tierStyles = treeApi.NAMEPLATE_STYLES.filter(s => s.tier === tier)
                const tierUnlocked = selectedTree.level >= tierStyles[0]?.unlockLevel
                const tierLabels = ['', '基础', '霓虹', '动态', '传说']
                const tierColors = ['', '#2980b9', '#00f5ff', '#ff4500', '#ffd700']
                return (
                  <div key={tier} className={`mb-3 p-3 rounded-xl border ${tierUnlocked ? 'border-indigo-500/20 bg-black/20' : 'border-stone-700/30 bg-black/10 opacity-50'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold" style={{ color: tierColors[tier] }}>{tierLabels[tier]}风格</span>
                      <span className="text-[10px] text-stone-500">Lv{tierStyles[0]?.unlockLevel}</span>
                      {!tierUnlocked && <span className="text-[10px] bg-stone-800 text-stone-400 px-1.5 py-0.5 rounded">🔒 未解锁</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {tierStyles.map(s => {
                        const isActive = decorStyle === s.id
                        const unlocked = tierUnlocked
                        return (
                          <button
                            key={s.id}
                            disabled={!unlocked}
                            onClick={() => setDecorStyle(isActive ? undefined : s.id)}
                            className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                              isActive
                                ? 'scale-[1.02]'
                                : unlocked ? 'hover:scale-[1.02] hover:brightness-125' : 'cursor-not-allowed'
                            }`}
                            style={{
                              background: s.gradient,
                              border: `1.5px solid ${s.borderColor}${isActive ? '' : '60'}`,
                              color: s.textColor,
                              boxShadow: isActive ? `${s.glow || ''}, 0 0 0 2px ${s.borderColor}` : 'none',
                            }}
                          >
                            <span className="truncate">{s.label}</span>
                            {isActive && <span className="ml-auto text-[10px]">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {/* 确认保存按钮 */}
              <button
                onClick={async () => {
                  const text = decorText.trim()
                  await handleSaveDecor({ nameplate: text || undefined, style: decorStyle })
                  setShowDecorPanel(false)
                }}
                className="w-full mt-3 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-indigo-500/30"
              >
                确认保存
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 植物园设置面板（教师端） */}
      <AnimatePresence>
        {showSettingsPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={(e) => { e.stopPropagation(); setShowSettingsPanel(false) }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 22 }}
              className="bg-white rounded-2xl shadow-2xl border border-stone-200 p-5 w-[400px] max-h-[80%] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-stone-800">植物园设置</h2>
                <button onClick={() => setShowSettingsPanel(false)} className="text-stone-400 hover:text-stone-600 text-lg">✕</button>
              </div>

              {/* 升级阈值 */}
              <div className="mb-5">
                <label className="text-sm font-semibold text-stone-700 mb-2 block">每级升级所需成长值</label>
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(lv => (
                    <div key={lv} className="flex items-center gap-2">
                      <span className="text-xs text-stone-500 w-16">Lv{lv - 1}→Lv{lv}</span>
                      <input
                        type="number"
                        min={1}
                        defaultValue={treeSettings.thresholds[lv] ?? treeApi.DEFAULT_GROWTH_THRESHOLDS[lv]}
                        className="flex-1 text-sm border border-stone-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        data-lv={lv}
                      />
                      <span className="text-[10px] text-stone-400">成长值</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 金果阈值 */}
              <div className="mb-5">
                <label className="text-sm font-semibold text-stone-700 mb-2 block">金果产出所需成长值</label>
                <p className="text-xs text-stone-400 mb-2">满级后累计此数值的成长，产出1个金果。越小越容易得</p>
                <input
                  type="number"
                  min={1}
                  defaultValue={treeSettings.goldThreshold}
                  id="settings-gold-threshold"
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              {/* 保存 */}
              <button
                onClick={async (e) => {
                  const panel = (e.target as HTMLElement).closest('.bg-white')!
                  const inputs = panel.querySelectorAll<HTMLInputElement>('input[data-lv]')
                  const newThresholds = [0, ...Array.from(inputs).map(inp => Math.max(1, parseInt(inp.value) || 1))]
                  const goldInput = panel.querySelector<HTMLInputElement>('#settings-gold-threshold')
                  const goldVal = Math.max(1, parseInt(goldInput?.value || '') || treeApi.DEFAULT_GOLD_FRUIT_THRESHOLD)
                  const newSettings: treeApi.TreeSettings = { thresholds: newThresholds, goldThreshold: goldVal }
                  await treeApi.setTreeSettings(newSettings)
                  setTreeSettings(newSettings)
                  setShowSettingsPanel(false)
                  setToast('设置已保存')
                  setTimeout(() => setToast(null), 2000)
                }}
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 active:scale-[0.98] transition-all"
              >
                保存设置
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 空状态 */}
      {trees.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-30">
          <div className="text-stone-600 text-center text-sm bg-white/80 px-6 py-3 rounded-xl shadow">
            暂无小组，请先在「小组积分」中创建小组
          </div>
        </div>
      )}

      {/* 结果全屏庆祝 */}
      <AnimatePresence>
        {fruitCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer"
            onClick={() => setFruitCelebration(null)}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', damping: 15, stiffness: 200 }}
              className="text-center px-10 py-8 rounded-3xl bg-gradient-to-b from-yellow-400/20 to-orange-500/20 border border-yellow-300/30"
              onClick={e => e.stopPropagation()}
            >
              <motion.div
                animate={{ rotate: [0, -5, 5, -5, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 1.5 }}
                className="text-7xl mb-4"
              >
                🎉
              </motion.div>
              <h2 className="text-3xl font-black text-white mb-4 drop-shadow-lg">
                恭喜结果！
              </h2>
              {fruitCelebration.map((evt, i) => (
                <motion.div
                  key={i}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2 + i * 0.15 }}
                  className="text-xl font-bold text-yellow-200 mb-2"
                >
                  🌟 {evt.groupName} 获得了{treeApi.FRUIT_TIER_NAMES[evt.tier - 1]}！
                </motion.div>
              ))}
              <p className="text-sm text-white/60 mt-6">快去收集果实吧！点击任意处关闭</p>
            </motion.div>

            {/* 粒子效果 */}
            {Array.from({ length: 20 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{
                  x: '50%',
                  y: '50%',
                  scale: 0,
                  opacity: 1,
                }}
                animate={{
                  x: `${20 + Math.random() * 60}%`,
                  y: `${10 + Math.random() * 80}%`,
                  scale: [0, 1.5, 0],
                  opacity: [1, 1, 0],
                }}
                transition={{ duration: 1.5 + Math.random(), delay: Math.random() * 0.5 }}
                className="fixed text-2xl pointer-events-none"
              >
                {['✨', '🌟', '⭐', '🎊', '🍎', '🍊'][i % 6]}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/95 text-stone-700 px-5 py-2.5 rounded-xl shadow-lg text-sm z-50 border border-stone-100"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
