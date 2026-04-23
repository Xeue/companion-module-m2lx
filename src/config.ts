import { type SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	host: string
	user: string
	pass: string
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Target URL',
			width: 12,
		},
		{
			type: 'textinput',
			id: 'user',
			label: 'Username',
			width: 6,
		},
		{
			type: 'textinput',
			id: 'pass',
			label: 'Password',
			width: 6,
		},
	]
}
