import { LogLevel } from '@companion-module/base'
import { ModuleConfig } from './config.js'
import { WebSocket } from 'ws'
import EventEmitter from 'events'

type payload = {
	status: element[]
}
type element = {
	node: string
	path: string
	state: state
}
type state = {
	connection: boolean
	connections: connection[]
	source: string
	preview: {
		background: {
			source: any
		}
		downstream_keys: key[]
		upstream_keys: key[]
	}
	program: {
		background: {
			source: any
		}
		downstream_keys: key[]
		upstream_keys: key[]
	}
	snapshots: any
	key: {
		source: string
		visible: boolean
	}
	running: boolean
	transition: {
		progress: {
			running: boolean
		}
	}
}
type connection = {
	output: string
	input: string
}
type statusSnapshot = {
	name: string
	title: string
	number: string
}

type snapshot = {
	name: string
	title: string
	number: number
	userdata: string
	description: string
}

type key = {
	key: {
		source: string
		visible: boolean
	}
}

type m2lxauthResponse = {
	access_token: string
	refresh_token: string
	expires_in: number
	id: string
	roledIds: string[]
}

type m2lxContextMap = {
	[key: string]: string
}

export class M2LX extends EventEmitter {
	config!: ModuleConfig // Setup in init()
	controlWS: WebSocket | undefined
	controlOpen: boolean
	statusWS: WebSocket | undefined
	statusOpen: boolean
	statusError: Error | undefined
	controlError: Error | undefined
	checkError: Event | undefined
	checkDetError: Event | undefined
	controlCloseStatus: number
	statusCloseStatus: number
	trans_running: boolean
	log: (level: LogLevel, message: string) => void
	contextMap: m2lxContextMap
	switcherStatus: {
		program: {
			[key: string]: any
		}
		preview: {
			[key: string]: any
		}
		snapshots: statusSnapshot[]
		keyStatus: {
			[key: string]: any
		}
	}
	output: {
		program: string
		preview: string
	}

	constructor(config: ModuleConfig, log: (level: LogLevel, message: string) => void) {
		super()
		this.config = config
		this.controlOpen = false
		this.statusOpen = false
		this.controlCloseStatus = 0
		this.statusCloseStatus = 0
		this.trans_running = false
		this.contextMap = {}
		this.switcherStatus = {
			program: {},
			preview: {},
			snapshots: [],
			keyStatus: {},
		}
		this.output = {
			program: 'program',
			preview: 'preview',
		}
		this.log = log
	}

	async start(): Promise<void> {
		let connecting = false
		if (this.controlWS !== undefined) {
			if (this.controlWS.readyState == 0) {
				connecting = true
			}
		}
		if (this.statusWS !== undefined) {
			if (this.statusWS.readyState == 0) {
				connecting = true
			}
		}
		if (connecting) {
			return
		}

		if (this.controlOpen) {
			if (this.controlWS !== undefined) {
				//$SD.api.logMessage('Connect: controlWS.close()' + csp.controlOpen); // 確認用に今回だけログに出す
				this.log('info', `Connect: controlWS.close() ${this.controlOpen}`)
				this.controlWS.close()
			} else {
				this.controlOpen = false
				this.log('info', `Connect: controlOpen = false' ${this.controlOpen}`)
			}
		}

		if (this.statusOpen) {
			if (this.statusWS !== undefined) {
				//$SD.api.logMessage('Connect: statusWS.close()' + csp.statusOpen); // 確認用に今回だけログに出す
				this.log('info', `Connect: statusWS.close() ${this.statusOpen}`)
				this.statusWS.close()
			} else {
				this.statusOpen = false
				this.log('info', `Connect: statusOpen = false ${this.statusOpen}, ${this.statusWS}`)
			}
		}

		if (this.controlOpen || this.statusOpen) {
			return
		}

		this.switcherStatus.program = {}
		this.switcherStatus.preview = {}
		this.switcherStatus.snapshots = []
		this.switcherStatus.keyStatus = {}

		// let basicAuth = btoa(`${this.config.user}:${this.config.pass}`);

		this.log('info', 'Connecting to M2L-X...')

		const response = await fetch(`https://${this.config.host}/api/local_auth/signin`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				alias: this.config.user,
				password: this.config.pass,
			}),
		})
		const data = (await response.json()) as m2lxauthResponse

		const token = data.access_token

		process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
		const controlUrl = `wss://${this.config.host}/api/v1/switcher_controller?access_token=${token}`
		const statusUrl = `wss://${this.config.host}/api/v1/switcher_status?nodes=mixer,router&access_token=${token}`

		this.log('info', controlUrl)
		this.log('info', statusUrl)
		this.controlWS = new WebSocket(controlUrl, 'json')
		this.controlWS.on('error', (error) => {
			if (this.controlError == null) {
				//this.log('info', 'WebSocket (control) error: ', event);
				this.log('error', `WebSocket (control) error: ${error.message}`)
				// $SD.api.logMessage('WebSocket (control) error / status:      / URL:' + csp.host);
			}
			this.controlError = error
			// DO FEEDBACK
			this.refreshAllStates()
		})

		this.controlWS.on('close', (code) => {
			if (this.controlCloseStatus != code) {
				//this.log('info', 'WebSocket (control) close: ', event, event.code);
				this.log('warn', `WebSocket (control) close: ${code}`)
				// $SD.api.logMessage('WebSocket (control) close / status: ' + event.code + ' / URL:' + csp.host);
			}
			this.controlOpen = false
			this.controlCloseStatus = code
			this.controlWS = undefined
			// DO FEEDBACK
			this.refreshAllStates()
		})

		this.controlWS.on('open', () => {
			this.log('info', `WebSocket (control) open: ${this.config.host}`)
			// $SD.api.logMessage('WebSocket (control) open  / status:      / URL:' + csp.host);
			this.controlOpen = true
			this.controlError = undefined
			if (this.controlError === null && this.statusError === null) {
				this.checkError = undefined
				this.checkDetError = undefined
			}
			// 先に Status API が open した場合はここでボタンの更新を行う
			// DO FEEDBACK
			this.refreshAllStates()
		})

		this.controlWS.on('message', (data) => {
			this.controlError = undefined
			const jsonObj = JSON.parse(JSON.stringify(data))
			if (jsonObj.code !== 200) {
				const match = jsonObj.message.match(/Invalid request: invalid source name '(.*)'/)
				if (match && match.length == 2) {
					const input = match[1]
					const jsonObj: any = Object.values(this.contextMap).find(
						(jsonObj: any) =>
							jsonObj.payload && jsonObj.payload.settings && jsonObj.payload.settings.mixer_input === input,
					)
					if (jsonObj) {
						// $SD.api.showAlert(jsonObj.context);
						this.log('info', jsonObj.context)
					}
				}
			}
		})

		this.statusWS = new WebSocket(statusUrl, 'json')
		this.statusWS.on('error', (error) => {
			if (this.statusError == null) {
				//this.log('info', 'WebSocket (status) error: ', event);
				this.log('error', `WebSocket (status) error: ${error.message}`)
				// $SD.api.logMessage('WebSocket (status ) error / status:      / URL:' + csp.host);
			}
			this.statusError = error
			// DO FEEDBACK
			this.refreshAllStates()
		})

		this.statusWS.on('close', (code) => {
			if (this.statusCloseStatus != code) {
				//this.log('info', 'WebSocket (status) close: ', event);
				this.log('warn', `WebSocket (status) close: ${code}`)
				// $SD.api.logMessage('WebSocket (status ) close / status: ' + event.code + ' / URL:' + csp.host);
			}
			this.statusOpen = false
			this.statusCloseStatus = code
			this.statusWS = undefined
			// DO FEEDBACK
			this.refreshAllStates()
		})

		this.statusWS.on('open', () => {
			this.log('info', `WebSocket (status) open: ${this.config.host}`)
			// $SD.api.logMessage('WebSocket (status ) open  / status:      / URL:' + csp.host);
			this.statusOpen = true
			this.statusError = undefined
			if (this.controlError === null && this.statusError === null) {
				this.checkError = undefined
				this.checkDetError = undefined
			}
		})

		this.statusWS.on('message', (data) => {
			this.onStatusUpdate(JSON.parse(JSON.stringify(data)))
			this.statusError = undefined
		})
	}

	sendCSP(command: { [key: string]: any }): void {
		if (this.controlWS && this.controlOpen) {
			this.log('info', `csp send: ${JSON.stringify(command)}`)
			this.controlWS.send(JSON.stringify(command))
		} else {
			this.log(
				'info',
				`csp send error: ${JSON.stringify(command)}, ${JSON.stringify(this.controlWS)}, ${this.controlOpen}`,
			)
		}
	}

	onStatusUpdate(payload: payload): void {
		//this.log('info', 'Switcher status update: ', payload);
		// this.log('info', JSON.stringify(payload))
		if (!payload.status) return
		payload.status.forEach((element) => {
			if (element.node === 'router' && element.path === '/') {
				// M2L-X v1.0 向け (v1.1 / CPS v3.5 以降は router ではなく mixer で通知されるように変更)
				if (element.state.connection !== undefined) {
					this.log('info', `router: ${element.state.connection}`)
					this.switcherStatus.program = {}
					this.switcherStatus.preview = {}
					element.state.connections.forEach((connection) => {
						if (connection.output === this.output.program) {
							this.switcherStatus.program[connection.input] = true
						}
						if (connection.output === this.output.preview) {
							this.switcherStatus.preview[connection.input] = true
						}
					})
					// DO FEEDBACK
					this.refreshInputStates()
				}
			} else if (element.node === 'mixer') {
				// PGM/PVW Tally
				const preview =
					element.path === '/preview/background'
						? element.state.source
						: element.path === '/'
							? element.state.preview.background.source
							: null
				if (preview !== null) {
					//this.log('info', 'PVW:', preview);
					this.switcherStatus.preview = {}
					this.switcherStatus.preview[preview] = true
					// DO FEEDBACK
					this.refreshInputStates()
				}
				const program =
					element.path === '/program/background'
						? element.state.source
						: element.path === '/'
							? element.state.program.background.source
							: null
				if (program !== null) {
					//this.log('info', 'PGM:', program);
					this.switcherStatus.program = {}
					this.switcherStatus.program[program] = true
					// DO FEEDBACK
					this.refreshInputStates()
				}

				// Snapshots
				// let force_update = false;
				const snapshots: snapshot[] =
					element.path === '/snapshots' ? element.state : element.path === '/' ? element.state.snapshots : null
				if (snapshots) {
					// 初回はすべて更新させる
					// if(element.path === '/') {
					//     force_update = true;
					// }
					let snapshots_order: string[] = []
					this.switcherStatus.snapshots = []
					// __SCENE_ORDER__ シーンに「,」区切りで格納されている
					snapshots.forEach((snapshot) => {
						if (snapshot.name === '__SCENE_ORDER__') {
							snapshots_order = snapshot.userdata.split(',')
						}
					})
					// __SCENE_ORDER__ 順に並び替えて保持しておく
					snapshots_order.forEach((snapshot_id) => {
						snapshots.forEach((snapshot) => {
							// Snapshot Number (SceneID:SnapshotNumber)
							// V1.1 では使用しないが取得・保持しておく
							const id = snapshot_id.split(':')
							const number = id[1] // 存在しない場合は undefined
							this.log('info', `snapshots: ${snapshot_id}, ${id}, ${JSON.stringify(snapshot)}, ${number}`)
							if (id[0] === snapshot.name) {
								const item = {
									name: snapshot.name,
									title: snapshot.description.replace(/.*\\/, ''),
									number: number,
								}
								this.switcherStatus.snapshots.push(item)
							}
						})
					})
					// DO FEEDBACK
					this.refreshSceneStates()
				}

				const keyNames = ['preview_downstream', 'program_downstream', 'preview_upstream', 'program_upstream']
				// 接続して最初の Status では全てのキーの情報が通知される
				if (element.path === '/') {
					// Initialize
					this.switcherStatus.keyStatus = {}
					const states = [
						element.state.preview.downstream_keys,
						element.state.program.downstream_keys,
						element.state.preview.upstream_keys,
						element.state.program.upstream_keys,
					]

					states.forEach((keys, id) => {
						keys.forEach((value, index) => {
							// キーソースが設定されていないキーは操作しない
							const visible = value.key.source === '' ? undefined : value.key.visible
							this.switcherStatus.keyStatus[`${keyNames[id]}_${index}`] = visible
							this.log('info', `key ${keyNames[id]}_${index} : ${visible}`)
						})
					})
					// DO FEEDBACK
					this.refreshKeyStates()
				}
				// 二度目以降は変更があったキーの情報のみが通知される
				else {
					const regExes = [
						/^\/preview\/downstream_keys\/(\d{1,})/,
						/^\/program\/downstream_keys\/(\d{1,})/,
						/^\/preview\/upstream_keys\/(\d{1,})/,
						/^\/program\/upstream_keys\/(\d{1,})/,
					]
					regExes.forEach((regEx, id) => {
						const keyIndex = regEx.exec(element.path)
						if (null !== keyIndex) {
							// Update Key Status
							const visible = element.state.key.source === '' ? undefined : element.state.key.visible
							const keyName = `${keyNames[id]}_${keyIndex[1]}`
							this.switcherStatus.keyStatus[`${keyName}`] = visible
							this.log('info', `key ${keyNames[id]}_${keyIndex[1]} : ${visible}`)
						}
					})
					// DO FEEDBACK
					this.refreshKeyStates()
				}

				// Transition
				const is_trans_progress =
					element.path === '/transition/progress'
						? element.state.running
						: element.path === '/'
							? element.state.transition.progress.running
							: null
				const trans_progress =
					element.path === '/transition/progress'
						? element.state
						: element.path === '/'
							? element.state.transition.progress
							: null
				if (trans_progress !== null && is_trans_progress !== null) {
					this.trans_running = is_trans_progress
				}
			}
		})
		this.log('info', JSON.stringify(this.switcherStatus))
	}

	refreshAllStates(): void {
		this.refreshInputStates()
		this.refreshKeyStates()
		this.refreshSceneStates()
	}

	refreshInputStates(): void {
		this.emit('feedback-input')
	}

	refreshKeyStates(): void {
		this.emit('feedback-key')
	}

	refreshSceneStates(): void {
		this.emit('feedback-scene')
	}
}
