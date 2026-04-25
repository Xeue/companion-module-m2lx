import type { ModuleInstance } from './main.js'
import type { M2LX } from './m2lx.js'

const KEY_TYPE_CHOICES = [
	{ id: 'downstream', label: 'DSK (Downstream)' },
	{ id: 'upstream', label: 'USK (Upstream)' },
]

const TARGET_CHOICES = [
	{ id: 'program', label: 'Program' },
	{ id: 'preview', label: 'Preview' },
]

const IDENTITY_SHAPE = {
	vertices: [
		{ position: [0, 0], tex_coord: [0, 0] },
		{ position: [1, 0], tex_coord: [1, 0] },
		{ position: [1, 1], tex_coord: [1, 1] },
		{ position: [0, 1], tex_coord: [0, 1] },
	],
}

// Named effects the mixer understands in configure_effect.name.
const WIPE_PATTERN_CHOICES = [
	{ id: 'wipe_right', label: 'Wipe Right' },
	{ id: 'wipe_left', label: 'Wipe Left' },
	{ id: 'wipe_up', label: 'Wipe Up' },
	{ id: 'wipe_down', label: 'Wipe Down' },
	{ id: 'wipe_up_right', label: 'Wipe Up-Right' },
	{ id: 'wipe_up_left', label: 'Wipe Up-Left' },
	{ id: 'wipe_down_right', label: 'Wipe Down-Right' },
	{ id: 'wipe_down_left', label: 'Wipe Down-Left' },
]

const UNDERLYING_TYPE_CHOICES = [
	{ id: 'cut', label: 'Cut' },
	{ id: 'crossfade', label: 'Mix (crossfade)' },
	...WIPE_PATTERN_CHOICES,
]

function setTransitionKeyProp(m2lx: M2LX, name: string, value: unknown): void {
	m2lx.sendCSP({
		command: 'set_key_property',
		node: 'mixer',
		args: { key_index: 0, key_type: 'transition', target: 'program', property: { name, value } },
	})
}

// Ensure any active clip overlay is removed before a plain cut/mix/wipe take.
function clearClipOverlay(m2lx: M2LX): void {
	m2lx.sendCSP({ command: 'configure_effect', node: 'mixer', args: { animated: false } })
	setTransitionKeyProp(m2lx, 'image', '')
	setTransitionKeyProp(m2lx, 'translation', { x: 0, y: 0 })
	setTransitionKeyProp(m2lx, 'scale', { x: 1, y: 1 })
	setTransitionKeyProp(m2lx, 'rotation', 0)
	setTransitionKeyProp(m2lx, 'shape', IDENTITY_SHAPE)
}

// DSKs appear on both buses and are mirrored. USKs are independent per bus.
function keyTargets(keyType: string, chosen: string): string[] {
	return keyType === 'downstream' ? ['program', 'preview'] : [chosen]
}

export function UpdateActions(self: ModuleInstance): void {
	self.setActionDefinitions({
		pgm_cut: {
			name: 'Cut PGM',
			options: [
				{
					id: 'xpt',
					type: 'textinput',
					label: 'Program Src',
					default: 'cam1',
					useVariables: true,
				},
			],
			callback: async (event, context) => {
				if (!self.m2lx) return
				const xpt = await context.parseVariablesInString(String(event.options.xpt))
				self.m2lx.sendCSP({
					command: 'set_input_property',
					node: 'mixer',
					args: {
						input_type: 'program',
						property: {
							name: 'video',
							value: xpt,
						},
					},
				})
			},
		},
		pvw_cut: {
			name: 'Cut PVW',
			options: [
				{
					id: 'xpt',
					type: 'textinput',
					label: 'Preview Src',
					default: 'cam1',
					useVariables: true,
				},
			],
			callback: async (event, context) => {
				if (!self.m2lx) return
				const xpt = await context.parseVariablesInString(String(event.options.xpt))
				self.m2lx.sendCSP({
					command: 'set_input_property',
					node: 'mixer',
					args: {
						input_type: 'preview',
						property: {
							name: 'video',
							value: xpt,
						},
					},
				})
			},
		},
		cut: {
			name: 'Take: Cut',
			options: [
				{
					id: 'flip_flop',
					type: 'checkbox',
					label: 'Flip-Flop',
					default: true,
					tooltip: 'If enabled, PGM and PVW swap after the cut.',
				},
			],
			callback: async (event) => {
				if (!self.m2lx) return
				if (self.m2lx.trans_running) return
				clearClipOverlay(self.m2lx)
				self.m2lx.sendCSP({
					command: 'configure_effect',
					node: 'mixer',
					args: { name: 'cut', args: { fade: 0 } },
				})
				self.m2lx.sendCSP({
					command: 'configure_effect',
					node: 'mixer',
					args: { toggle_mode: !!event.options.flip_flop },
				})
				self.m2lx.sendCSP({ command: 'transition', node: 'mixer', args: { effect_enabled: true } })
			},
		},
		mix: {
			name: 'Take: Mix (crossfade)',
			options: [
				{
					id: 'fade',
					type: 'number',
					label: 'Fade amount (0-1)',
					default: 0.02,
					min: 0,
					max: 1,
					step: 0.01,
					tooltip: 'Crossfade softness; 0 is a hard swap, higher values ease in/out.',
				},
				{
					id: 'flip_flop',
					type: 'checkbox',
					label: 'Flip-Flop',
					default: true,
					tooltip: 'If enabled, PGM and PVW swap after the transition.',
				},
			],
			callback: async (event) => {
				if (!self.m2lx) return
				if (self.m2lx.trans_running) return
				self.m2lx.trans_running = true
				clearClipOverlay(self.m2lx)
				self.m2lx.sendCSP({
					command: 'configure_effect',
					node: 'mixer',
					args: { name: 'crossfade', args: { fade: Number(event.options.fade) } },
				})
				self.m2lx.sendCSP({
					command: 'configure_effect',
					node: 'mixer',
					args: { toggle_mode: !!event.options.flip_flop },
				})
				self.m2lx.sendCSP({ command: 'transition', node: 'mixer', args: { effect_enabled: true } })
			},
		},
		wipe: {
			name: 'Take: Wipe',
			options: [
				{
					id: 'pattern',
					type: 'dropdown',
					label: 'Wipe Pattern',
					choices: WIPE_PATTERN_CHOICES,
					default: 'wipe_right',
					allowCustom: true,
					tooltip: 'Choose a built-in pattern or type a custom name (e.g. "wipe_right").',
				},
				{
					id: 'fade',
					type: 'number',
					label: 'Edge softness (0-1)',
					default: 0.02,
					min: 0,
					max: 1,
					step: 0.01,
					tooltip: '0 = hard edge; higher values feather the wipe boundary.',
				},
				{
					id: 'flip_flop',
					type: 'checkbox',
					label: 'Flip-Flop',
					default: true,
				},
			],
			callback: async (event) => {
				if (!self.m2lx) return
				if (self.m2lx.trans_running) return
				self.m2lx.trans_running = true
				clearClipOverlay(self.m2lx)
				self.m2lx.sendCSP({
					command: 'configure_effect',
					node: 'mixer',
					args: { name: String(event.options.pattern), args: { fade: Number(event.options.fade) } },
				})
				self.m2lx.sendCSP({
					command: 'configure_effect',
					node: 'mixer',
					args: { toggle_mode: !!event.options.flip_flop },
				})
				self.m2lx.sendCSP({ command: 'transition', node: 'mixer', args: { effect_enabled: true } })
			},
		},
		wipe_duration: {
			name: 'Transition Duration',
			options: [
				{
					id: 'duration',
					type: 'textinput',
					label: 'Duration',
					default: '0.5s',
					useVariables: true,
					tooltip: 'A duration string the switcher accepts, e.g. "0.5s", "1s", "1.5s", "2s".',
				},
			],
			callback: async (event, context) => {
				if (!self.m2lx) return
				const duration = (await context.parseVariablesInString(String(event.options.duration))).trim() || '0.5s'
				self.m2lx.sendCSP({
					command: 'configure_effect',
					node: 'mixer',
					args: { duration },
				})
			},
		},
		transition_effect: {
			name: 'Transition Effect (type)',
			options: [
				{
					id: 'name',
					type: 'textinput',
					label: 'Effect name',
					default: 'crossfade',
					useVariables: true,
					tooltip: 'Common values: crossfade, dip, wipe, push, dve. Exact support depends on the switcher firmware.',
				},
				{
					id: 'fade',
					type: 'number',
					label: 'Fade amount (crossfade only, 0-1)',
					default: 0.02,
					min: 0,
					max: 1,
					step: 0.01,
					tooltip: 'Only used when Effect name is "crossfade". Ignored otherwise.',
				},
			],
			callback: async (event, context) => {
				if (!self.m2lx) return
				const name = (await context.parseVariablesInString(String(event.options.name))).trim() || 'crossfade'
				const args: { name: string; args?: { fade: number } } = { name }
				if (name === 'crossfade') {
					args.args = { fade: Number(event.options.fade) }
				}
				self.m2lx.sendCSP({
					command: 'configure_effect',
					node: 'mixer',
					args,
				})
			},
		},
		clip_transition: {
			name: 'Take: Clip Transition',
			options: [
				{
					id: 'clip',
					type: 'textinput',
					label: 'Clip path',
					default: '',
					useVariables: true,
					tooltip:
						'e.g. cliptrans/<uuid>.webp. Leave empty to clear the clip overlay (and take using the underlying type only).',
				},
				{
					id: 'underlying',
					type: 'dropdown',
					label: 'Underlying transition type',
					choices: UNDERLYING_TYPE_CHOICES,
					default: 'cut',
					tooltip: 'The transition played beneath the clip overlay.',
				},
				{
					id: 'fade',
					type: 'number',
					label: 'Underlying fade/softness (0-1)',
					default: 0,
					min: 0,
					max: 1,
					step: 0.01,
					tooltip: 'Ignored when underlying = Cut.',
				},
				{
					id: 'flip_flop',
					type: 'checkbox',
					label: 'Flip-Flop',
					default: true,
				},
			],
			callback: async (event, context) => {
				if (!self.m2lx) return
				if (self.m2lx.trans_running) return
				const clip = (await context.parseVariablesInString(String(event.options.clip))).trim()
				const underlying = String(event.options.underlying)
				const fade = Number(event.options.fade)
				const m2lx = self.m2lx
				const setProp = (name: string, value: unknown): void => {
					m2lx.sendCSP({
						command: 'set_key_property',
						node: 'mixer',
						args: { key_index: 0, key_type: 'transition', target: 'program', property: { name, value } },
					})
				}

				// 1. Configure the clip overlay.
				if (!clip) {
					m2lx.sendCSP({ command: 'configure_effect', node: 'mixer', args: { animated: false } })
					setProp('image', '')
					setProp('translation', { x: 0, y: 0 })
					setProp('scale', { x: 1, y: 1 })
					setProp('rotation', 0)
					setProp('shape', IDENTITY_SHAPE)
				} else {
					setProp('translation', { x: 0, y: 0 })
					setProp('scale', { x: 1, y: 1 })
					setProp('rotation', 0)
					setProp('shape', IDENTITY_SHAPE)
					setProp('image', clip)
					m2lx.sendCSP({ command: 'configure_effect', node: 'mixer', args: { animated: true } })
				}

				// 2. Set the underlying transition type (cut uses fade=0).
				m2lx.sendCSP({
					command: 'configure_effect',
					node: 'mixer',
					args: { name: underlying, args: { fade: underlying === 'cut' ? 0 : fade } },
				})

				// 3. Take.
				m2lx.trans_running = true
				m2lx.sendCSP({
					command: 'configure_effect',
					node: 'mixer',
					args: { toggle_mode: !!event.options.flip_flop },
				})
				m2lx.sendCSP({ command: 'transition', node: 'mixer', args: { effect_enabled: true } })
			},
		},
		key: {
			name: 'Keyer Set Visible',
			options: [
				{ id: 'key_type', type: 'dropdown', label: 'Type', choices: KEY_TYPE_CHOICES, default: 'downstream' },
				{ id: 'num', type: 'number', label: 'Keyer', default: 1, min: 1, max: 8 },
				{
					id: 'target',
					type: 'dropdown',
					label: 'Bus (USK only; DSK mirrors to both)',
					choices: TARGET_CHOICES,
					default: 'program',
				},
				{ id: 'state', type: 'checkbox', label: 'Visible', default: true },
			],
			callback: async (event) => {
				if (!self.m2lx) return
				const keyType = String(event.options.key_type)
				const num = Number(event.options.num) - 1
				const state = !!event.options.state
				for (const target of keyTargets(keyType, String(event.options.target))) {
					self.m2lx.sendCSP({
						command: 'set_key_property',
						node: 'mixer',
						args: {
							key_index: num,
							key_type: keyType,
							target,
							property: { name: 'visible', value: state },
						},
					})
				}
			},
		},
		key_toggle: {
			name: 'Keyer Toggle',
			options: [
				{ id: 'key_type', type: 'dropdown', label: 'Type', choices: KEY_TYPE_CHOICES, default: 'downstream' },
				{ id: 'num', type: 'number', label: 'Keyer', default: 1, min: 1, max: 8 },
				{
					id: 'target',
					type: 'dropdown',
					label: 'Bus (USK only; DSK reads Program)',
					choices: TARGET_CHOICES,
					default: 'program',
				},
			],
			callback: async (event) => {
				if (!self.m2lx) return
				const keyType = String(event.options.key_type)
				const num = Number(event.options.num) - 1
				const target = String(event.options.target)
				const readTarget = keyType === 'downstream' ? 'program' : target
				const state = !!self.m2lx.switcherStatus.keyStatus[`${readTarget}_${keyType}_${num}`]
				for (const t of keyTargets(keyType, target)) {
					self.m2lx.sendCSP({
						command: 'set_key_property',
						node: 'mixer',
						args: {
							key_index: num,
							key_type: keyType,
							target: t,
							property: { name: 'visible', value: !state },
						},
					})
				}
			},
		},
		key_source: {
			name: 'Keyer Source',
			options: [
				{ id: 'key_type', type: 'dropdown', label: 'Type', choices: KEY_TYPE_CHOICES, default: 'downstream' },
				{ id: 'num', type: 'number', label: 'Keyer', default: 1, min: 1, max: 8 },
				{
					id: 'target',
					type: 'dropdown',
					label: 'Bus (USK only; DSK applies to both)',
					choices: TARGET_CHOICES,
					default: 'program',
				},
				{
					id: 'type',
					type: 'dropdown',
					label: 'Source',
					choices: [
						{ id: 1, label: 'HTML5' },
						{ id: 2, label: 'Off' },
					],
					default: 1,
				},
			],
			callback: async (event) => {
				if (!self.m2lx) return
				const keyType = String(event.options.key_type)
				const num = Number(event.options.num) - 1
				const targets = keyTargets(keyType, String(event.options.target))
				const isHtml5 = Number(event.options.type) === 1
				const m2lx = self.m2lx
				const send = (target: string, name: string, value: unknown): void => {
					m2lx.sendCSP({
						command: 'set_key_property',
						node: 'mixer',
						args: { key_index: num, key_type: keyType, target, property: { name, value } },
					})
				}
				for (const target of targets) {
					if (isHtml5) {
						send(target, 'video', '')
					} else {
						send(target, 'visible', false)
						send(target, 'image', '')
					}
					send(target, 'translation', { x: 0, y: 0 })
					send(target, 'scale', { x: 1, y: 1 })
					send(target, 'rotation', 0)
					send(target, 'shape', IDENTITY_SHAPE)
					if (isHtml5) {
						send(target, 'video', 'HTML5 Input')
					}
				}
			},
		},
		snapshot_recall: {
			name: 'Recall Snapshot',
			options: [
				{
					id: 'name',
					type: 'textinput',
					label: 'Snapshot name',
					default: '',
					useVariables: true,
					tooltip: 'Internal snapshot name (see $(m2lx:snapshot_N_name) variables).',
				},
				{
					id: 'target',
					type: 'dropdown',
					label: 'Target',
					choices: TARGET_CHOICES,
					default: 'preview',
				},
			],
			callback: async (event, context) => {
				if (!self.m2lx) return
				const name = (await context.parseVariablesInString(String(event.options.name))).trim()
				if (!name) return
				self.m2lx.sendCSP({
					command: 'load_snapshot',
					node: 'mixer',
					args: { name, target: String(event.options.target) },
				})
			},
		},
		clip_play: {
			name: 'Play Clip',
			options: [
				{
					id: 'num',
					type: 'number',
					label: 'Clip Player',
					default: 1,
					min: 1,
					max: 4,
				},
			],
			callback: async (event) => {
				if (!self.m2lx) return
				const num = event.options.num
				self.m2lx.sendCSP({ command: 'play', node: 'vtr' + num })
			},
		},
		clip_pause: {
			name: 'Pause Clip',
			options: [
				{
					id: 'num',
					type: 'number',
					label: 'Clip Player',
					default: 1,
					min: 1,
					max: 4,
				},
			],
			callback: async (event) => {
				if (!self.m2lx) return
				const num = event.options.num
				self.m2lx.sendCSP({ command: 'pause', node: 'vtr' + num })
			},
		},
		clip_reset: {
			name: 'Reset Clip',
			options: [
				{
					id: 'num',
					type: 'number',
					label: 'Clip Player',
					default: 1,
					min: 1,
					max: 4,
				},
			],
			callback: async (event) => {
				if (!self.m2lx) return
				const num = event.options.num
				self.m2lx.sendCSP({ command: 'seek_start', node: 'vtr' + num })
			},
		},
		clip_ff: {
			name: 'Fast Forward Clip',
			options: [
				{
					id: 'num',
					type: 'number',
					label: 'Clip Player',
					default: 1,
					min: 1,
					max: 4,
				},
				{
					id: 'rate',
					type: 'number',
					label: 'Speed',
					default: 1,
					min: 1,
					max: 10,
				},
			],
			callback: async (event) => {
				if (!self.m2lx) return
				const num = event.options.num
				self.m2lx.sendCSP({ command: 'fast_forward', node: 'vtr' + num, args: { rate: event.options.rate } })
			},
		},
		clip_rw: {
			name: 'Rewind Clip',
			options: [
				{
					id: 'num',
					type: 'number',
					label: 'Clip Player',
					default: 1,
					min: 1,
					max: 4,
				},
				{
					id: 'rate',
					type: 'number',
					label: 'Speed',
					default: 1,
					min: 1,
					max: 10,
				},
			],
			callback: async (event) => {
				if (!self.m2lx) return
				const num = event.options.num
				self.m2lx.sendCSP({ command: 'rewind', node: 'vtr' + num, args: { rate: event.options.rate } })
			},
		},
		clip_seek: {
			name: 'Seek Clip',
			options: [
				{
					id: 'num',
					type: 'number',
					label: 'Clip Player',
					default: 1,
					min: 1,
					max: 4,
				},
				{
					id: 'pos',
					type: 'textinput',
					label: 'Seconds',
					default: '10.0',
				},
			],
			callback: async (event) => {
				if (!self.m2lx) return
				const num = event.options.num
				self.m2lx.sendCSP({ command: 'seek', node: 'vtr' + num, args: { time: event.options.pos } })
			},
		},
		clip_load: {
			name: 'Load Clip',
			options: [
				{
					id: 'num',
					type: 'number',
					label: 'Clip Player',
					default: 1,
					min: 1,
					max: 4,
				},
				{
					id: 'clip',
					type: 'textinput',
					label: 'Clip name',
					default: 'UUID.mp4',
					useVariables: true,
				},
			],
			callback: async (event, context) => {
				if (!self.m2lx) return
				const num = event.options.num
				const clip = await context.parseVariablesInString(String(event.options.clip))
				self.m2lx.sendCSP({ command: 'load', node: 'vtr' + num, args: { id: clip } })
			},
		},

		// ------------------------------------------------------------------
		// REST-backed actions (event/output/tally/operation-mode)
		// ------------------------------------------------------------------

		event_start: {
			name: 'Event: Start',
			options: [],
			callback: async () => {
				if (!self.m2lx?.currentEventId) {
					self.log('warn', 'event_start: no currentEventId')
					return
				}
				try {
					await self.m2lx.restPost(`/api/events/start/${encodeURIComponent(self.m2lx.currentEventId)}`)
				} catch (err) {
					self.log('error', `event_start failed: ${(err as Error).message}`)
				}
			},
		},
		event_stop: {
			name: 'Event: Stop',
			options: [],
			callback: async () => {
				if (!self.m2lx?.currentEventId) return
				try {
					await self.m2lx.restPost(`/api/events/stop/${encodeURIComponent(self.m2lx.currentEventId)}`)
				} catch (err) {
					self.log('error', `event_stop failed: ${(err as Error).message}`)
				}
			},
		},
		event_restart: {
			name: 'Event: Restart',
			options: [],
			callback: async () => {
				if (!self.m2lx?.currentEventId) return
				try {
					await self.m2lx.restPost(`/api/events/restart/${encodeURIComponent(self.m2lx.currentEventId)}`)
				} catch (err) {
					self.log('error', `event_restart failed: ${(err as Error).message}`)
				}
			},
		},

		output_start: {
			name: 'Output: Start',
			options: [{ id: 'id', type: 'number', label: 'Output ID', default: 1, min: 1, max: 33 }],
			callback: async (event) => {
				if (!self.m2lx?.currentEventId) return
				try {
					await self.m2lx.restPost(
						`/api/output/start/${encodeURIComponent(self.m2lx.currentEventId)}/${Number(event.options.id)}`,
					)
				} catch (err) {
					self.log('error', `output_start failed: ${(err as Error).message}`)
				}
			},
		},
		output_stop: {
			name: 'Output: Stop',
			options: [{ id: 'id', type: 'number', label: 'Output ID', default: 1, min: 1, max: 33 }],
			callback: async (event) => {
				if (!self.m2lx?.currentEventId) return
				try {
					await self.m2lx.restPost(
						`/api/output/stop/${encodeURIComponent(self.m2lx.currentEventId)}/${Number(event.options.id)}`,
					)
				} catch (err) {
					self.log('error', `output_stop failed: ${(err as Error).message}`)
				}
			},
		},
		output_all_start: {
			name: 'Output: Start All',
			options: [],
			callback: async () => {
				if (!self.m2lx?.currentEventId) return
				try {
					await self.m2lx.restPost(`/api/output/all_start/${encodeURIComponent(self.m2lx.currentEventId)}`)
				} catch (err) {
					self.log('error', `output_all_start failed: ${(err as Error).message}`)
				}
			},
		},
		output_all_stop: {
			name: 'Output: Stop All',
			options: [],
			callback: async () => {
				if (!self.m2lx?.currentEventId) return
				try {
					await self.m2lx.restPost(`/api/output/all_stop/${encodeURIComponent(self.m2lx.currentEventId)}`)
				} catch (err) {
					self.log('error', `output_all_stop failed: ${(err as Error).message}`)
				}
			},
		},

		operation_mode_set: {
			name: 'Operation Mode: Set Flip-Flop',
			options: [{ id: 'flip_flop', type: 'checkbox', label: 'Flip-Flop enabled', default: true }],
			callback: async (event) => {
				if (!self.m2lx?.currentEventId) return
				try {
					await self.m2lx.restPost(
						`/api/events/operation_mode/update/${encodeURIComponent(self.m2lx.currentEventId)}`,
						{ flip_flop: !!event.options.flip_flop },
					)
				} catch (err) {
					self.log('error', `operation_mode_set failed: ${(err as Error).message}`)
				}
			},
		},

		tally_colour_set: {
			name: 'Tally: Set Colours',
			options: [
				{
					id: 'program_source',
					type: 'dropdown',
					label: 'Program',
					choices: [
						{ id: 'Red', label: 'Red' },
						{ id: 'Green', label: 'Green' },
						{ id: 'Yellow', label: 'Yellow' },
						{ id: 'None', label: 'None' },
					],
					default: 'Red',
				},
				{
					id: 'preview_source',
					type: 'dropdown',
					label: 'Preview',
					choices: [
						{ id: 'Red', label: 'Red' },
						{ id: 'Green', label: 'Green' },
						{ id: 'Yellow', label: 'Yellow' },
						{ id: 'None', label: 'None' },
					],
					default: 'Green',
				},
				{
					id: 'clean_source',
					type: 'dropdown',
					label: 'Clean',
					choices: [
						{ id: 'Red', label: 'Red' },
						{ id: 'Green', label: 'Green' },
						{ id: 'Yellow', label: 'Yellow' },
						{ id: 'None', label: 'None' },
					],
					default: 'None',
				},
			],
			callback: async (event) => {
				if (!self.m2lx?.currentEventId) return
				try {
					await self.m2lx.restPost(`/api/tally/enable/update/${encodeURIComponent(self.m2lx.currentEventId)}`, {
						program_source: String(event.options.program_source),
						preview_source: String(event.options.preview_source),
						clean_source: String(event.options.clean_source),
					})
				} catch (err) {
					self.log('error', `tally_colour_set failed: ${(err as Error).message}`)
				}
			},
		},
	})
}
