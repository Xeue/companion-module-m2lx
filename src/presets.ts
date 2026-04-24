import {
	combineRgb,
	type CompanionButtonPresetDefinition,
	type CompanionOptionValues,
	type CompanionPresetDefinitions,
} from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import { SNAPSHOT_VARIABLE_SLOTS } from './variables.js'

const BLACK = combineRgb(0, 0, 0)
const WHITE = combineRgb(255, 255, 255)
const RED = combineRgb(200, 0, 0)
const GREEN = combineRgb(0, 160, 0)
const AMBER = combineRgb(200, 120, 0)
const GREY = combineRgb(60, 60, 60)

type ButtonPreset = CompanionButtonPresetDefinition

function xptPreset(source: string, bus: 'pgm' | 'pvw'): ButtonPreset {
	const isPgm = bus === 'pgm'
	return {
		type: 'button',
		category: isPgm ? 'PGM Bus' : 'PVW Bus',
		name: `${source} -> ${isPgm ? 'PGM' : 'PVW'}`,
		style: {
			text: source,
			size: '14',
			color: WHITE,
			bgcolor: GREY,
		},
		steps: [
			{
				down: [
					{
						actionId: isPgm ? 'pgm_cut' : 'pvw_cut',
						options: { xpt: source },
					},
				],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: isPgm ? 'xpt_pgm' : 'xpt_pvw',
				options: { xpt: source },
				style: { bgcolor: isPgm ? RED : GREEN, color: BLACK },
			},
		],
	}
}

function keyerPreset(
	label: string,
	keyType: 'downstream' | 'upstream',
	num: number,
	target: 'program' | 'preview',
): ButtonPreset {
	const category = keyType === 'downstream' ? 'DSK' : 'USK'
	return {
		type: 'button',
		category,
		name: `${label} (${target.toUpperCase()})`,
		style: {
			text: label,
			size: '14',
			color: WHITE,
			bgcolor: GREY,
		},
		steps: [
			{
				down: [
					{
						actionId: 'key_toggle',
						options: { key_type: keyType, num, target },
					},
				],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: 'key_active',
				options: { key_type: keyType, num, target },
				style: { bgcolor: target === 'program' ? RED : GREEN, color: BLACK },
			},
		],
	}
}

function transitionPreset(
	name: string,
	text: string,
	actionId: string,
	extraOptions: CompanionOptionValues = {},
): ButtonPreset {
	return {
		type: 'button',
		category: 'Transition',
		name,
		style: {
			text,
			size: '18',
			color: WHITE,
			bgcolor: GREY,
		},
		steps: [
			{
				down: [
					{
						actionId,
						options: extraOptions,
					},
				],
				up: [],
			},
		],
		feedbacks: [
			{
				feedbackId: 'transition_running',
				options: {},
				style: { bgcolor: AMBER, color: BLACK },
			},
		],
	}
}

function clipPreset(num: number, verb: 'Play' | 'Pause' | 'Reset', actionId: string): ButtonPreset {
	return {
		type: 'button',
		category: 'Clip Transport',
		name: `Clip ${num} ${verb}`,
		style: {
			text: `C${num}\\n${verb}`,
			size: '14',
			color: WHITE,
			bgcolor: GREY,
		},
		steps: [
			{
				down: [{ actionId, options: { num } }],
				up: [],
			},
		],
		feedbacks: [],
	}
}

function snapshotPreset(slot: number): ButtonPreset {
	return {
		type: 'button',
		category: 'Snapshots',
		name: `Recall Snapshot ${slot}`,
		style: {
			text: `$(m2lx:snapshot_${slot}_title)`,
			size: '14',
			color: WHITE,
			bgcolor: GREY,
		},
		steps: [
			{
				down: [
					{
						actionId: 'snapshot_recall',
						options: { name: `$(m2lx:snapshot_${slot}_name)`, target: 'preview' },
					},
				],
				up: [],
			},
		],
		feedbacks: [],
	}
}

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions = {}

	// PGM / PVW bus rows: 24 cameras, 4 NDI, 4 clips for each bus.
	const sources = [
		...Array.from({ length: 24 }, (_, i) => `cam${i + 1}`),
		...Array.from({ length: 4 }, (_, i) => `ndi${i + 1}`),
		...Array.from({ length: 4 }, (_, i) => `vtr${i + 1}`),
	]
	for (const src of sources) {
		presets[`pgm_${src}`] = xptPreset(src, 'pgm')
		presets[`pvw_${src}`] = xptPreset(src, 'pvw')
	}

	// Keyer rows.
	for (const target of ['program', 'preview'] as const) {
		for (let n = 1; n <= 2; n++) {
			presets[`dsk_${n}_${target}`] = keyerPreset(`DSK ${n}`, 'downstream', n, target)
		}
		const uskLabels = ['Layer 1', 'Layer 2', 'Layer 3', 'Layer 4', 'KEY 1', 'KEY 2', 'KEY 3', 'KEY 4']
		for (let n = 1; n <= uskLabels.length; n++) {
			presets[`usk_${n}_${target}`] = keyerPreset(uskLabels[n - 1], 'upstream', n, target)
		}
	}

	// Transition controls.
	presets.trans_cut = transitionPreset('Cut', 'CUT', 'cut', { flip_flop: true })
	presets.trans_auto = transitionPreset('Auto', 'AUTO', 'auto', { flip_flop: true })
	presets.trans_wipe = transitionPreset('Wipe (crossfade)', 'WIPE', 'wipe')
	for (const d of ['0.5s', '1s', '1.5s']) {
		presets[`trans_dur_${d.replace('.', '_')}`] = {
			type: 'button',
			category: 'Transition',
			name: `Duration ${d}`,
			style: { text: d, size: '14', color: WHITE, bgcolor: GREY },
			steps: [{ down: [{ actionId: 'wipe_duration', options: { duration: d } }], up: [] }],
			feedbacks: [],
		}
	}

	// Clip transport.
	for (let c = 1; c <= 4; c++) {
		presets[`clip_${c}_play`] = clipPreset(c, 'Play', 'clip_play')
		presets[`clip_${c}_pause`] = clipPreset(c, 'Pause', 'clip_pause')
		presets[`clip_${c}_reset`] = clipPreset(c, 'Reset', 'clip_reset')
	}

	// Snapshot recall grid.
	for (let s = 1; s <= SNAPSHOT_VARIABLE_SLOTS; s++) {
		presets[`snapshot_${s}`] = snapshotPreset(s)
	}

	// Connection status indicator.
	presets.connection_status = {
		type: 'button',
		category: 'Status',
		name: 'Connection',
		style: {
			text: 'M2L-X',
			size: '14',
			color: WHITE,
			bgcolor: GREY,
		},
		steps: [{ down: [], up: [] }],
		feedbacks: [
			{
				feedbackId: 'connection_ok',
				options: {},
				style: { bgcolor: GREEN, color: WHITE },
			},
		],
	}

	self.setPresetDefinitions(presets)
}
