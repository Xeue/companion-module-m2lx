import { combineRgb } from '@companion-module/base'
import type { ModuleInstance } from './main.js'

type m2lxBusStatus = {
	[key: string]: boolean
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	self.setFeedbackDefinitions({
		xpt_pgm: {
			name: 'PGM Tally',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					id: 'xpt',
					type: 'textinput',
					label: 'Source',
					default: 'cam1',
					useVariables: true,
				},
			],
			callback: async (feedback, context) => {
				const xpt = await context.parseVariablesInString(String(feedback.options.xpt))
				self.log('info', 'FEEDBACK: ' + self.m2lx?.switcherStatus.program[xpt])
				const pgm = self.m2lx?.switcherStatus.program as m2lxBusStatus
				const keys = Object.keys(pgm)
				if (keys.includes(xpt)) {
					return true
				} else {
					return false
				}
			},
		},
		xpt_pvw: {
			name: 'PVW Tally',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 255, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					id: 'xpt',
					type: 'textinput',
					label: 'Source',
					default: 'cam1',
					useVariables: true,
				},
			],
			callback: async (feedback, context) => {
				const xpt = await context.parseVariablesInString(String(feedback.options.xpt))
				self.log('info', 'FEEDBACK: ' + self.m2lx?.switcherStatus.preview[xpt])
				const pgm = self.m2lx?.switcherStatus.preview as m2lxBusStatus
				const keys = Object.keys(pgm)
				if (keys.includes(xpt)) {
					return true
				} else {
					return false
				}
			},
		},
		key_pgm: {
			name: 'Key PGM Tally',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					id: 'key_type',
					type: 'dropdown',
					label: 'Type',
					choices: [
						{ id: 'downstream', label: 'DSK (Downstream)' },
						{ id: 'upstream', label: 'USK (Upstream)' },
					],
					default: 'downstream',
				},
				{ id: 'num', type: 'number', label: 'Keyer', default: 1, min: 1, max: 8 },
			],
			callback: async (feedback) => {
				if (!self.m2lx) return false
				const num = Number(feedback.options.num) - 1
				const keyType = String(feedback.options.key_type)
				return !!self.m2lx.switcherStatus.keyStatus[`program_${keyType}_${num}`]
			},
		},
		key_pvw: {
			name: 'Key PVW Tally',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 255, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					id: 'key_type',
					type: 'dropdown',
					label: 'Type',
					choices: [
						{ id: 'downstream', label: 'DSK (Downstream)' },
						{ id: 'upstream', label: 'USK (Upstream)' },
					],
					default: 'downstream',
				},
				{ id: 'num', type: 'number', label: 'Keyer', default: 1, min: 1, max: 8 },
			],
			callback: async (feedback) => {
				if (!self.m2lx) return false
				const num = Number(feedback.options.num) - 1
				const keyType = String(feedback.options.key_type)
				return !!self.m2lx.switcherStatus.keyStatus[`preview_${keyType}_${num}`]
			},
		},
		key_active: {
			name: 'Key Active (parameterised bus)',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					id: 'key_type',
					type: 'dropdown',
					label: 'Type',
					choices: [
						{ id: 'downstream', label: 'DSK (Downstream)' },
						{ id: 'upstream', label: 'USK (Upstream)' },
					],
					default: 'downstream',
				},
				{ id: 'num', type: 'number', label: 'Keyer', default: 1, min: 1, max: 8 },
				{
					id: 'target',
					type: 'dropdown',
					label: 'Bus',
					choices: [
						{ id: 'program', label: 'Program' },
						{ id: 'preview', label: 'Preview' },
					],
					default: 'program',
				},
			],
			callback: async (feedback) => {
				if (!self.m2lx) return false
				const num = Number(feedback.options.num) - 1
				const keyType = String(feedback.options.key_type)
				const target = String(feedback.options.target)
				return !!self.m2lx.switcherStatus.keyStatus[`${target}_${keyType}_${num}`]
			},
		},
		transition_running: {
			name: 'Transition in progress',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(255, 128, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [],
			callback: async () => !!self.m2lx?.trans_running,
		},
		connection_ok: {
			name: 'Connected to switcher',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 128, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [],
			callback: async () => !!(self.m2lx && self.m2lx.controlOpen && self.m2lx.statusOpen),
		},
		event_status: {
			name: 'Event status',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 128, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'status',
					type: 'dropdown',
					label: 'Status',
					choices: [
						{ id: 'Running', label: 'Running' },
						{ id: 'Starting', label: 'Starting' },
						{ id: 'Stopping', label: 'Stopping' },
						{ id: 'Stopped', label: 'Stopped' },
						{ id: 'Resetting', label: 'Resetting' },
						{ id: 'Initializing', label: 'Initializing' },
						{ id: 'Failed', label: 'Failed' },
						{ id: 'Dead', label: 'Dead' },
					],
					default: 'Running',
				},
			],
			callback: async (feedback) => {
				if (!self.m2lx?.currentEventId) return false
				const e = self.m2lx.rest.events.find((x) => x.event_id === self.m2lx!.currentEventId)
				return e?.status === feedback.options.status
			},
		},
		output_online: {
			name: 'Output online',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 128, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [{ id: 'id', type: 'number', label: 'Output ID', default: 1, min: 1, max: 33 }],
			callback: async (feedback) => {
				if (!self.m2lx) return false
				const match = self.m2lx.rest.outputs.find((o) => o.id === Number(feedback.options.id))
				return match?.status === 'online'
			},
		},
		operation_mode_flip_flop: {
			name: 'Flip-Flop enabled (event mode)',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 128, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [],
			callback: async () => !!self.m2lx?.rest.operationMode.flip_flop,
		},
		input_online: {
			name: 'Input signal online',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 128, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'kind',
					type: 'dropdown',
					label: 'Input kind',
					choices: [
						{ id: 'switcher', label: 'Switcher input (unified view)' },
						{ id: 'router', label: 'Router input (physical feed)' },
						{ id: 'mic', label: 'Mic input' },
					],
					default: 'router',
				},
				{ id: 'id', type: 'number', label: 'ID', default: 1, min: 1, max: 24 },
			],
			callback: async (feedback) => {
				if (!self.m2lx) return false
				const id = Number(feedback.options.id)
				const kind = String(feedback.options.kind)
				let list: { id: number; status?: string }[] = []
				if (kind === 'switcher') list = self.m2lx.rest.switcherInputs
				else if (kind === 'router') list = self.m2lx.rest.routerInputs
				else if (kind === 'mic') list = self.m2lx.rest.micInputs
				const match = list.find((e) => e.id === id)
				return match?.status === 'online'
			},
		},
		tally_colour: {
			name: 'Tally colour active',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 128, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{
					id: 'bus',
					type: 'dropdown',
					label: 'Bus',
					choices: [
						{ id: 'program_source', label: 'Program' },
						{ id: 'preview_source', label: 'Preview' },
						{ id: 'clean_source', label: 'Clean' },
					],
					default: 'program_source',
				},
				{
					id: 'colour',
					type: 'dropdown',
					label: 'Colour',
					choices: [
						{ id: 'Red', label: 'Red' },
						{ id: 'Green', label: 'Green' },
						{ id: 'Yellow', label: 'Yellow' },
						{ id: 'None', label: 'None' },
					],
					default: 'Red',
				},
			],
			callback: async (feedback) => {
				if (!self.m2lx) return false
				const bus = String(feedback.options.bus) as keyof typeof self.m2lx.rest.tally
				return self.m2lx.rest.tally[bus] === feedback.options.colour
			},
		},
	})
}
