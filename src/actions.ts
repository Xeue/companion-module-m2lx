import type { ModuleInstance } from './main.js'
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
			name: 'Cut',
			options: [],
			callback: async () => {
				if (!self.m2lx) return
				self.m2lx.sendCSP({ command: 'transition', node: 'mixer', args: { effect_enabled: false } })
			},
		},
		wipe: {
			name: 'Wipe',
			options: [],
			callback: async () => {
				if (!self.m2lx) return
				self.m2lx.sendCSP({
					command: 'configure_effect',
					node: 'mixer',
					args: { name: 'crossfade', args: { fade: 0.02 } },
				})
				self.m2lx.sendCSP({ command: 'transition', node: 'mixer', args: { effect_enabled: true } })
			},
		},
		wipe_duration: {
			name: 'Tansition Duration',
			options: [
				{
					id: 'num',
					type: 'dropdown',
					label: 'Duration',
					choices: [
						{ id: 1, label: '0.5s' },
						{ id: 2, label: '1s' },
						{ id: 3, label: '1.5s' },
					],
					default: 1,
				},
			],
			callback: async (event) => {
				const map: { [key: string]: string } = { 1: '0.5s', 2: '1s', 3: '1.5s' }
				if (!self.m2lx) return
				self.m2lx.sendCSP({
					command: 'configure_effect',
					node: 'mixer',
					args: { duration: map[event.options.num as number] },
				})
			},
		},
		key: {
			name: 'Keyer',
			options: [
				{
					id: 'num',
					type: 'number',
					label: 'Keyer',
					default: 1,
					min: 1,
					max: 2,
				},
				{
					id: 'state',
					type: 'checkbox',
					label: 'State',
					default: true,
				},
			],
			callback: async (event) => {
				if (!self.m2lx) return
				const num = Number(event.options.num) - 1
				const state = event.options.state
				self.m2lx.sendCSP({
					command: 'set_key_property',
					node: 'mixer',
					args: {
						key_index: num,
						key_type: 'downstream',
						target: 'program',
						property: { name: 'visible', value: state },
					},
				})
				self.m2lx.sendCSP({
					command: 'set_key_property',
					node: 'mixer',
					args: {
						key_index: num,
						key_type: 'downstream',
						target: 'preview',
						property: { name: 'visible', value: state },
					},
				})
			},
		},
		key_toggle: {
			name: 'Keyer Toggle',
			options: [
				{
					id: 'num',
					type: 'number',
					label: 'Keyer',
					default: 1,
					min: 1,
					max: 2,
				},
			],
			callback: async (event) => {
				if (!self.m2lx) return
				const num = Number(event.options.num) - 1
				const state = self.m2lx.switcherStatus.keyStatus['program_downstream_' + num]
				self.m2lx.sendCSP({
					command: 'set_key_property',
					node: 'mixer',
					args: {
						key_index: num,
						key_type: 'downstream',
						target: 'program',
						property: { name: 'visible', value: !state },
					},
				})
				self.m2lx.sendCSP({
					command: 'set_key_property',
					node: 'mixer',
					args: {
						key_index: num,
						key_type: 'downstream',
						target: 'preview',
						property: { name: 'visible', value: !state },
					},
				})
			},
		},
		key_source: {
			name: 'Keyer Source',
			options: [
				{
					id: 'num',
					type: 'number',
					label: 'Keyer',
					default: 1,
					min: 1,
					max: 2,
				},
				{
					id: 'type',
					type: 'dropdown',
					label: 'Type',
					choices: [
						{ id: 1, label: 'HTML5' },
						{ id: 2, label: 'Off' },
					],
					default: 1,
				},
			],
			callback: async (event) => {
				if (!self.m2lx) return
				const num = Number(event.options.num) - 1
				switch (event.options.type) {
					case 1:
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'program',
								property: { name: 'video', value: '' },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'preview',
								property: { name: 'video', value: '' },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'program',
								property: { name: 'translation', value: { x: 0, y: 0 } },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'preview',
								property: { name: 'translation', value: { x: 0, y: 0 } },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'program',
								property: { name: 'scale', value: { x: 1, y: 1 } },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'preview',
								property: { name: 'scale', value: { x: 1, y: 1 } },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'program',
								property: { name: 'rotation', value: 0 },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'preview',
								property: { name: 'rotation', value: 0 },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'program',
								property: {
									name: 'shape',
									value: {
										vertices: [
											{ position: [0, 0], tex_coord: [0, 0] },
											{ position: [1, 0], tex_coord: [1, 0] },
											{ position: [1, 1], tex_coord: [1, 1] },
											{ position: [0, 1], tex_coord: [0, 1] },
										],
									},
								},
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'preview',
								property: {
									name: 'shape',
									value: {
										vertices: [
											{ position: [0, 0], tex_coord: [0, 0] },
											{ position: [1, 0], tex_coord: [1, 0] },
											{ position: [1, 1], tex_coord: [1, 1] },
											{ position: [0, 1], tex_coord: [0, 1] },
										],
									},
								},
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'program',
								property: { name: 'video', value: 'HTML5 Input' },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'preview',
								property: { name: 'video', value: 'HTML5 Input' },
							},
						})
						break
					case 2:
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'program',
								property: { name: 'visible', value: false },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'preview',
								property: { name: 'visible', value: false },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'program',
								property: { name: 'image', value: '' },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'preview',
								property: { name: 'image', value: '' },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'program',
								property: { name: 'translation', value: { x: 0, y: 0 } },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'preview',
								property: { name: 'translation', value: { x: 0, y: 0 } },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'program',
								property: { name: 'scale', value: { x: 1, y: 1 } },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'preview',
								property: { name: 'scale', value: { x: 1, y: 1 } },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'program',
								property: { name: 'rotation', value: 0 },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'preview',
								property: { name: 'rotation', value: 0 },
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'program',
								property: {
									name: 'shape',
									value: {
										vertices: [
											{ position: [0, 0], tex_coord: [0, 0] },
											{ position: [1, 0], tex_coord: [1, 0] },
											{ position: [1, 1], tex_coord: [1, 1] },
											{ position: [0, 1], tex_coord: [0, 1] },
										],
									},
								},
							},
						})
						self.m2lx.sendCSP({
							command: 'set_key_property',
							node: 'mixer',
							args: {
								key_index: num,
								key_type: 'downstream',
								target: 'preview',
								property: {
									name: 'shape',
									value: {
										vertices: [
											{ position: [0, 0], tex_coord: [0, 0] },
											{ position: [1, 0], tex_coord: [1, 0] },
											{ position: [1, 1], tex_coord: [1, 1] },
											{ position: [0, 1], tex_coord: [0, 1] },
										],
									},
								},
							},
						})
						break
				}
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
					id: 'clip',
					type: 'textinput',
					label: 'Clip name',
					default: 'UUDI.mp4',
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
	})
}
