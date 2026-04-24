import type {
	CompanionStaticUpgradeScript,
	CompanionMigrationAction,
	CompanionMigrationFeedback,
} from '@companion-module/base'
import type { ModuleConfig } from './config.js'

// wipe_duration: `num` dropdown (1|2|3) replaced by `duration` dropdown ('0.5s'|'1s'|'1.5s').
const migrateWipeDuration: CompanionStaticUpgradeScript<ModuleConfig> = (_context, props) => {
	const map: { [k: string]: string } = { '1': '0.5s', '2': '1s', '3': '1.5s' }
	const updatedActions: CompanionMigrationAction[] = []
	for (const action of props.actions) {
		if (action.actionId !== 'wipe_duration') continue
		if (action.options?.num === undefined) continue
		const key = String(action.options.num)
		action.options.duration = map[key] ?? '0.5s'
		delete action.options.num
		updatedActions.push(action)
	}
	return { updatedConfig: null, updatedActions, updatedFeedbacks: [] }
}

// Keyer actions/feedbacks gained a `key_type` option (and actions a `target` option).
// Previously all keyer entries were implicitly DSK, affecting both buses.
const KEYER_ACTION_IDS = new Set(['key', 'key_toggle', 'key_source'])
const KEYER_FEEDBACK_IDS = new Set(['key_pgm', 'key_pvw'])
const migrateKeyerType: CompanionStaticUpgradeScript<ModuleConfig> = (_context, props) => {
	const updatedActions: CompanionMigrationAction[] = []
	const updatedFeedbacks: CompanionMigrationFeedback[] = []
	for (const action of props.actions) {
		if (!KEYER_ACTION_IDS.has(action.actionId)) continue
		let changed = false
		if (action.options && action.options.key_type === undefined) {
			action.options.key_type = 'downstream'
			changed = true
		}
		if (action.options && action.options.target === undefined) {
			action.options.target = 'program'
			changed = true
		}
		if (changed) updatedActions.push(action)
	}
	for (const feedback of props.feedbacks) {
		if (!KEYER_FEEDBACK_IDS.has(feedback.feedbackId)) continue
		if (feedback.options && feedback.options.key_type === undefined) {
			feedback.options.key_type = 'downstream'
			updatedFeedbacks.push(feedback)
		}
	}
	return { updatedConfig: null, updatedActions, updatedFeedbacks }
}

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = [migrateWipeDuration, migrateKeyerType]
