import { type SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	host: string
	user: string
	pass: string
	allowSelfSigned?: boolean
	event_id?: string
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
		{
			type: 'textinput',
			id: 'event_id',
			label: 'Event ID (optional — auto-picks the first Running event if empty)',
			width: 12,
			default: '',
		},
		{
			type: 'checkbox',
			id: 'allowSelfSigned',
			label: 'Allow self-signed TLS certificates',
			width: 12,
			default: true,
			tooltip:
				'M2L-X ships with a self-signed cert by default. Disable this only if you have installed a trusted cert.',
		},
	]
}
