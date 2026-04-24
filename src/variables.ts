import type { CompanionVariableDefinition, CompanionVariableValues } from '@companion-module/base'
import type { ModuleInstance } from './main.js'

export const SNAPSHOT_VARIABLE_SLOTS = 32
export const ROUTER_INPUT_VARIABLE_SLOTS = 24

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const defs: CompanionVariableDefinition[] = [
		{ variableId: 'connection_state', name: 'Connection state (connected|degraded|disconnected)' },
		{ variableId: 'pgm_source', name: 'Program source' },
		{ variableId: 'pvw_source', name: 'Preview source' },
		{ variableId: 'transition_running', name: 'Transition in progress (1|0)' },
		{ variableId: 'snapshot_count', name: 'Number of snapshots on the switcher' },
		{ variableId: 'event_id', name: 'Current event ID' },
		{ variableId: 'event_name', name: 'Current event name' },
		{ variableId: 'event_status', name: 'Current event status' },
		{ variableId: 'operation_mode_flip_flop', name: 'Event flip-flop mode (1|0)' },
		{ variableId: 'm2lx_version', name: 'M2L-X version' },
		{ variableId: 'm2lx_frontend_version', name: 'M2L-X frontend version' },
		{ variableId: 'm2lx_backend_version', name: 'M2L-X backend version' },
		{ variableId: 'cert_expiry_days', name: 'Days until TLS cert expiry' },
		{ variableId: 'cpu_utilization', name: 'CPU utilization (0-1)' },
		{ variableId: 'gpu_utilization', name: 'GPU utilization (0-1)' },
	]
	for (let i = 1; i <= SNAPSHOT_VARIABLE_SLOTS; i++) {
		defs.push({ variableId: `snapshot_${i}_name`, name: `Snapshot ${i} internal name` })
		defs.push({ variableId: `snapshot_${i}_title`, name: `Snapshot ${i} display title` })
	}
	for (let i = 1; i <= ROUTER_INPUT_VARIABLE_SLOTS; i++) {
		defs.push({ variableId: `input_router_${i}_name`, name: `Router input ${i} display name` })
		defs.push({ variableId: `input_router_${i}_status`, name: `Router input ${i} status (online|offline|none)` })
	}
	self.setVariableDefinitions(defs)
}

export function publishVariables(self: ModuleInstance): void {
	const m = self.m2lx
	const values: CompanionVariableValues = {}
	if (!m) {
		values.connection_state = 'disconnected'
		values.pgm_source = ''
		values.pvw_source = ''
		values.transition_running = 0
		values.snapshot_count = 0
		values.event_id = ''
		values.event_name = ''
		values.event_status = ''
		values.operation_mode_flip_flop = 0
		values.m2lx_version = ''
		values.m2lx_frontend_version = ''
		values.m2lx_backend_version = ''
		values.cert_expiry_days = ''
		values.cpu_utilization = ''
		values.gpu_utilization = ''
		for (let i = 1; i <= SNAPSHOT_VARIABLE_SLOTS; i++) {
			values[`snapshot_${i}_name`] = ''
			values[`snapshot_${i}_title`] = ''
		}
		for (let i = 1; i <= ROUTER_INPUT_VARIABLE_SLOTS; i++) {
			values[`input_router_${i}_name`] = ''
			values[`input_router_${i}_status`] = ''
		}
		self.setVariableValues(values)
		return
	}

	values.connection_state =
		m.controlOpen && m.statusOpen ? 'connected' : m.controlOpen || m.statusOpen ? 'degraded' : 'disconnected'
	values.pgm_source = Object.keys(m.switcherStatus.program)[0] ?? ''
	values.pvw_source = Object.keys(m.switcherStatus.preview)[0] ?? ''
	values.transition_running = m.trans_running ? 1 : 0
	values.snapshot_count = m.switcherStatus.snapshots.length
	const evt = m.rest.events.find((e) => e.event_id === m.currentEventId)
	values.event_id = m.currentEventId ?? ''
	values.event_name = evt?.event_name ?? ''
	values.event_status = evt?.status ?? ''
	values.operation_mode_flip_flop = m.rest.operationMode.flip_flop ? 1 : 0
	values.m2lx_version = String(m.rest.version.m2lx ?? '')
	values.m2lx_frontend_version = String(m.rest.version.m2lx_frontend ?? '')
	values.m2lx_backend_version = String(m.rest.version.m2lx_backend ?? '')
	values.cert_expiry_days = m.rest.certExpiryDays ?? ''
	values.cpu_utilization = m.rest.resource.cpu_utilization ?? ''
	values.gpu_utilization = m.rest.resource.gpu_utilization ?? ''
	for (let i = 1; i <= SNAPSHOT_VARIABLE_SLOTS; i++) {
		const snap = m.switcherStatus.snapshots[i - 1]
		values[`snapshot_${i}_name`] = snap?.name ?? ''
		values[`snapshot_${i}_title`] = snap?.title ?? ''
	}
	for (let i = 1; i <= ROUTER_INPUT_VARIABLE_SLOTS; i++) {
		const entry = m.rest.routerInputs.find((e) => e.id === i)
		values[`input_router_${i}_name`] = entry?.name ?? ''
		values[`input_router_${i}_status`] = entry?.status ?? ''
	}
	self.setVariableValues(values)
}
