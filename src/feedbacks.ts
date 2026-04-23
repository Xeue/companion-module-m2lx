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
					id: 'num',
					type: 'number',
					label: 'Keyer',
					default: 1,
					min: 1,
					max: 2,
				},
			],
			callback: async (feedback) => {
				if (!self.m2lx) return false
				const num = Number(feedback.options.num) - 1
				return self.m2lx.switcherStatus.keyStatus['program_downstream_' + num]
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
					id: 'num',
					type: 'number',
					label: 'Keyer',
					default: 1,
					min: 1,
					max: 2,
				},
			],
			callback: async (feedback) => {
				if (!self.m2lx) return false
				const num = Number(feedback.options.num) - 1
				return self.m2lx.switcherStatus.keyStatus['preview_downstream_' + num]
			},
		},
	})
}
