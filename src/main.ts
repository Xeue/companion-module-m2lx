import { InstanceBase, runEntrypoint, InstanceStatus, SomeCompanionConfigField, LogLevel } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { M2LX } from './m2lx.js'

export class ModuleInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig // Setup in init()
	m2lx: M2LX | undefined
	test: boolean

	constructor(internal: unknown) {
		super(internal)
		this.test = false
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config
		const log = (level: LogLevel, message: string) => {
			this.log(level, message)
		}
		this.m2lx = new M2LX(this.config, log)
		await this.m2lx.start()
		this.m2lx.on('feedback-input', () => {
			this.checkFeedbacks('xpt_pgm', 'xpt_pvw')
		})
		this.m2lx.on('feedback-key', () => {
			this.checkFeedbacks('key_pgm', 'key_pvw')
		})

		this.updateStatus(InstanceStatus.Ok)

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)
