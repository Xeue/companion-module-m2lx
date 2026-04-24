import { InstanceBase, runEntrypoint, InstanceStatus, SomeCompanionConfigField, LogLevel } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions, publishVariables } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
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
		this.setupM2LX()

		this.updateActions()
		this.updateFeedbacks()
		this.updateVariableDefinitions()
		this.updatePresets()

		await this.m2lx!.start()
	}

	private setupM2LX(): void {
		const log = (level: LogLevel, message: string) => this.log(level, message)
		const updateStatus = (status: InstanceStatus, message?: string | null) => this.updateStatus(status, message)
		this.m2lx = new M2LX(this.config, log, updateStatus)
		this.m2lx.on('feedback-input', () => {
			this.checkFeedbacks('xpt_pgm', 'xpt_pvw')
			publishVariables(this)
		})
		this.m2lx.on('feedback-key', () => {
			this.checkFeedbacks('key_pgm', 'key_pvw', 'key_active')
			publishVariables(this)
		})
		this.m2lx.on('feedback-scene', () => {
			publishVariables(this)
		})
		this.m2lx.on('feedback-transition', () => {
			this.checkFeedbacks('transition_running')
			publishVariables(this)
		})
		this.m2lx.on('feedback-connection', () => {
			this.checkFeedbacks('connection_ok')
			publishVariables(this)
		})
		this.m2lx.on('feedback-rest', () => {
			this.checkFeedbacks('event_status', 'output_online', 'operation_mode_flip_flop', 'tally_colour', 'input_online')
			publishVariables(this)
		})
		this.m2lx.on('feedback-rest-slow', () => {
			publishVariables(this)
		})
	}

	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', 'destroy')
		this.m2lx?.stop()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		if (this.m2lx) this.m2lx.stop()
		this.setupM2LX()
		await this.m2lx!.start()
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

	updatePresets(): void {
		UpdatePresets(this)
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)
