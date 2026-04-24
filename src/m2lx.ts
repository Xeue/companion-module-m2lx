import { InstanceStatus, LogLevel } from '@companion-module/base'
import { ModuleConfig } from './config.js'
import { WebSocket, type RawData } from 'ws'
import EventEmitter from 'events'
import https from 'node:https'

const RECONNECT_DELAY_MS = 5000
const HEARTBEAT_INTERVAL_MS = 30_000
const TOKEN_REFRESH_LEAD_MS = 60_000
const REST_POLL_INTERVAL_MS = 5000
const REST_SLOW_POLL_INTERVAL_MS = 60_000

function decodeFrame(data: RawData): string {
	if (typeof data === 'string') return data
	if (Buffer.isBuffer(data)) return data.toString('utf8')
	if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
	return Buffer.from(data).toString('utf8')
}

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

type m2lxTokenResponse = {
	access_token: string
	refresh_token?: string
	expires_in: number
}

export type StatusCallback = (status: InstanceStatus, message?: string | null) => void

export type EventOverviewEntry = {
	event_id: string
	event_name: string
	event_type?: string
	status: string
	endpoint?: unknown
}

export type OutputConfigEntry = {
	id: number
	status: string
	name?: string
	type?: string
	nickname?: string
}

export type TallyEnable = {
	program_source?: string
	preview_source?: string
	clean_source?: string
}

export type OperationMode = {
	flip_flop?: boolean
}

export type VersionInfo = {
	m2lx?: string
	m2lx_frontend?: string
	m2lx_backend?: string
	[k: string]: unknown
}

export type CertInfo = {
	expiry?: string
	[k: string]: unknown
}

export type ResourceStatus = {
	cpu_utilization?: number
	gpu_utilization?: number
	cpu_load_average_1min?: number
	cpu_load_average_5min?: number
	cpu_load_average_15min?: number
	gpu_dec?: number
	gpu_enc?: number
}

export type SwitcherInputEntry = {
	id: number
	source: string
	signal: string
	status: string
}

export type RouterInputEntry = {
	id: number
	status: string
	name?: string
	[k: string]: unknown
}

export type MicInputEntry = {
	id: number
	status?: string
	name?: string
	[k: string]: unknown
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
	controlCloseStatus: number
	statusCloseStatus: number
	trans_running: boolean
	log: (level: LogLevel, message: string) => void
	updateStatus: StatusCallback
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
	private accessToken: string | undefined
	private refreshToken: string | undefined
	private reconnectTimer: NodeJS.Timeout | undefined
	private refreshTimer: NodeJS.Timeout | undefined
	private heartbeatTimer: NodeJS.Timeout | undefined
	private heartbeatAlive: boolean
	private shuttingDown: boolean
	private starting: boolean
	private fastPollTimer: NodeJS.Timeout | undefined
	private slowPollTimer: NodeJS.Timeout | undefined
	currentEventId: string | undefined
	rest: {
		events: EventOverviewEntry[]
		outputs: OutputConfigEntry[]
		tally: TallyEnable
		operationMode: OperationMode
		version: VersionInfo
		certExpiryDays: number | undefined
		resource: ResourceStatus
		switcherInputs: SwitcherInputEntry[]
		routerInputs: RouterInputEntry[]
		micInputs: MicInputEntry[]
	}

	constructor(config: ModuleConfig, log: (level: LogLevel, message: string) => void, updateStatus: StatusCallback) {
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
		this.heartbeatAlive = false
		this.shuttingDown = false
		this.starting = false
		this.log = log
		this.updateStatus = updateStatus
		this.rest = {
			events: [],
			outputs: [],
			tally: {},
			operationMode: {},
			version: {},
			certExpiryDays: undefined,
			resource: {},
			switcherInputs: [],
			routerInputs: [],
			micInputs: [],
		}
	}

	private get allowSelfSigned(): boolean {
		return this.config.allowSelfSigned !== false
	}

	stop(): void {
		this.shuttingDown = true
		this.clearReconnect()
		this.clearRefresh()
		this.clearHeartbeat()
		this.clearPolling()
		if (this.controlWS) {
			this.controlWS.removeAllListeners()
			this.controlWS.close()
			this.controlWS = undefined
		}
		if (this.statusWS) {
			this.statusWS.removeAllListeners()
			this.statusWS.close()
			this.statusWS = undefined
		}
		this.controlOpen = false
		this.statusOpen = false
	}

	private clearPolling(): void {
		if (this.fastPollTimer) {
			clearInterval(this.fastPollTimer)
			this.fastPollTimer = undefined
		}
		if (this.slowPollTimer) {
			clearInterval(this.slowPollTimer)
			this.slowPollTimer = undefined
		}
	}

	private clearReconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = undefined
		}
	}

	private clearRefresh(): void {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer)
			this.refreshTimer = undefined
		}
	}

	private clearHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer)
			this.heartbeatTimer = undefined
		}
	}

	private scheduleReconnect(reason: string): void {
		if (this.shuttingDown) return
		if (this.reconnectTimer) return
		this.log('info', `scheduling reconnect (${reason}) in ${RECONNECT_DELAY_MS}ms`)
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = undefined
			void this.start()
		}, RECONNECT_DELAY_MS)
	}

	private updateConnectionStatus(): void {
		if (this.shuttingDown) return
		if (this.controlOpen && this.statusOpen) {
			this.updateStatus(InstanceStatus.Ok)
		} else if (this.controlOpen || this.statusOpen) {
			this.updateStatus(InstanceStatus.UnknownWarning, 'only one socket open')
		} else {
			this.updateStatus(InstanceStatus.ConnectionFailure, 'disconnected')
		}
		this.emit('feedback-connection')
	}

	async start(): Promise<void> {
		if (this.shuttingDown) return
		if (this.starting) return
		if (this.controlOpen || this.statusOpen) return
		this.clearReconnect()
		this.starting = true
		this.updateStatus(InstanceStatus.Connecting)

		this.switcherStatus.program = {}
		this.switcherStatus.preview = {}
		this.switcherStatus.snapshots = []
		this.switcherStatus.keyStatus = {}

		this.log('info', 'Connecting to M2L-X...')

		let authData: m2lxauthResponse
		try {
			authData = await this.signin()
		} catch (err) {
			const e = err as Error
			this.log('error', `signin failed: ${e.message}`)
			if (/401|403/.test(e.message)) {
				this.updateStatus(InstanceStatus.AuthenticationFailure, e.message)
			} else {
				this.updateStatus(InstanceStatus.ConnectionFailure, e.message)
			}
			this.starting = false
			this.scheduleReconnect('signin failed')
			return
		}

		this.accessToken = authData.access_token
		this.refreshToken = authData.refresh_token
		this.scheduleTokenRefresh(authData.expires_in)

		// Resolve event_id. If config didn't set one, pick the first Running event.
		await this.resolveEventId()

		const controlUrl = `wss://${this.config.host}/api/v1/switcher_controller?access_token=${this.accessToken}`
		const statusUrl = `wss://${this.config.host}/api/v1/switcher_status?nodes=mixer,router&access_token=${this.accessToken}`

		this.controlWS = new WebSocket(controlUrl, 'json', { rejectUnauthorized: this.allowSelfSigned ? false : true })
		this.attachControlHandlers(this.controlWS)

		this.statusWS = new WebSocket(statusUrl, 'json', { rejectUnauthorized: this.allowSelfSigned ? false : true })
		this.attachStatusHandlers(this.statusWS)

		this.startRestPolling()
		this.starting = false
	}

	private async resolveEventId(): Promise<void> {
		const configured = this.config.event_id?.trim()
		try {
			const overview = await this.restGet<EventOverviewEntry[]>('/api/events/overview')
			this.rest.events = overview
			if (configured) {
				const match = overview.find((e) => e.event_id === configured)
				this.currentEventId = match ? configured : configured
				if (!match) this.log('warn', `event_id "${configured}" not found in overview; using it anyway`)
			} else {
				const running = overview.find((e) => e.status === 'Running')
				this.currentEventId = running?.event_id ?? overview[0]?.event_id
				if (!this.currentEventId) this.log('warn', 'no events available from /api/events/overview')
				else this.log('info', `auto-selected event_id=${this.currentEventId} (status=${running ? 'Running' : 'first'})`)
			}
		} catch (err) {
			this.log('warn', `event overview failed: ${(err as Error).message}`)
			this.currentEventId = configured || undefined
		}
	}

	private startRestPolling(): void {
		this.clearPolling()
		this.fastPollTimer = setInterval(() => void this.fastPoll(), REST_POLL_INTERVAL_MS)
		this.slowPollTimer = setInterval(() => void this.slowPoll(), REST_SLOW_POLL_INTERVAL_MS)
		// immediate tick on both
		void this.fastPoll()
		void this.slowPoll()
	}

	private async fastPoll(): Promise<void> {
		if (this.shuttingDown || !this.accessToken) return
		try {
			this.rest.events = await this.restGet<EventOverviewEntry[]>('/api/events/overview')
		} catch (err) {
			this.log('debug', `events/overview poll failed: ${(err as Error).message}`)
		}
		if (!this.currentEventId) return
		const eid = encodeURIComponent(this.currentEventId)
		try {
			this.rest.outputs = await this.restGet<OutputConfigEntry[]>(`/api/output/list/${eid}`)
		} catch (err) {
			this.log('debug', `output/list poll failed: ${(err as Error).message}`)
		}
		try {
			this.rest.tally = await this.restGet<TallyEnable>(`/api/tally/enable/${eid}`)
		} catch (err) {
			this.log('debug', `tally/enable poll failed: ${(err as Error).message}`)
		}
		try {
			this.rest.operationMode = await this.restGet<OperationMode>(`/api/events/operation_mode/${eid}`)
		} catch (err) {
			this.log('debug', `operation_mode poll failed: ${(err as Error).message}`)
		}
		try {
			this.rest.switcherInputs = await this.restGet<SwitcherInputEntry[]>(`/api/input/switcher/list/${eid}`)
		} catch (err) {
			this.log('debug', `input/switcher/list poll failed: ${(err as Error).message}`)
		}
		try {
			this.rest.routerInputs = await this.restGet<RouterInputEntry[]>(`/api/input/router/list/${eid}`)
		} catch (err) {
			this.log('debug', `input/router/list poll failed: ${(err as Error).message}`)
		}
		try {
			this.rest.micInputs = await this.restGet<MicInputEntry[]>(`/api/input/mic/list/${eid}`)
		} catch (err) {
			this.log('debug', `input/mic/list poll failed: ${(err as Error).message}`)
		}
		this.emit('feedback-rest')
	}

	private async slowPoll(): Promise<void> {
		if (this.shuttingDown || !this.accessToken) return
		try {
			this.rest.version = await this.restGet<VersionInfo>('/api/version/list')
		} catch (err) {
			this.log('debug', `version/list poll failed: ${(err as Error).message}`)
		}
		try {
			const cert = await this.restGet<CertInfo>('/api/cert/expiry')
			if (cert.expiry) {
				const days = Math.max(0, Math.round((new Date(cert.expiry).getTime() - Date.now()) / 86_400_000))
				this.rest.certExpiryDays = Number.isFinite(days) ? days : undefined
			}
		} catch (err) {
			this.log('debug', `cert/expiry poll failed: ${(err as Error).message}`)
		}
		try {
			this.rest.resource = await this.restGet<ResourceStatus>('/api/system/resource_status')
		} catch (err) {
			this.log('debug', `resource_status poll failed: ${(err as Error).message}`)
		}
		this.emit('feedback-rest-slow')
	}

	async restGet<T>(path: string): Promise<T> {
		return this.httpsJson<T>('GET', path)
	}

	async restPost<T = unknown>(path: string, body: unknown = null): Promise<T> {
		return this.httpsJson<T>('POST', path, body)
	}

	private attachControlHandlers(ws: WebSocket): void {
		ws.on('error', (error) => {
			if (this.controlError == null) {
				this.log('error', `WebSocket (control) error: ${error.message}`)
			}
			this.controlError = error
			this.refreshAllStates()
		})

		ws.on('close', (code) => {
			if (this.controlCloseStatus != code) {
				this.log('warn', `WebSocket (control) close: ${code}`)
			}
			this.controlOpen = false
			this.controlCloseStatus = code
			this.controlWS = undefined
			this.refreshAllStates()
			this.updateConnectionStatus()
			if (!this.statusOpen) this.scheduleReconnect('control closed')
		})

		ws.on('open', () => {
			this.log('info', `WebSocket (control) open: ${this.config.host}`)
			this.controlOpen = true
			this.controlError = undefined
			this.refreshAllStates()
			this.updateConnectionStatus()
		})

		ws.on('message', (data) => {
			this.controlError = undefined
			let jsonObj: any
			try {
				jsonObj = JSON.parse(decodeFrame(data))
			} catch (err) {
				this.log('warn', `control message parse error: ${(err as Error).message}`)
				return
			}
			if (jsonObj.code !== 200) {
				const match = jsonObj.message?.match?.(/Invalid request: invalid source name '(.*)'/)
				if (match && match.length == 2) {
					const input = match[1]
					const ctx: any = Object.values(this.contextMap).find(
						(c: any) => c.payload && c.payload.settings && c.payload.settings.mixer_input === input,
					)
					if (ctx) {
						this.log('info', ctx.context)
					}
				}
			}
		})
	}

	private attachStatusHandlers(ws: WebSocket): void {
		ws.on('error', (error) => {
			if (this.statusError == null) {
				this.log('error', `WebSocket (status) error: ${error.message}`)
			}
			this.statusError = error
			this.refreshAllStates()
		})

		ws.on('close', (code) => {
			if (this.statusCloseStatus != code) {
				this.log('warn', `WebSocket (status) close: ${code}`)
			}
			this.statusOpen = false
			this.statusCloseStatus = code
			this.statusWS = undefined
			this.clearHeartbeat()
			this.refreshAllStates()
			this.updateConnectionStatus()
			if (!this.controlOpen) this.scheduleReconnect('status closed')
		})

		ws.on('open', () => {
			this.log('info', `WebSocket (status) open: ${this.config.host}`)
			this.statusOpen = true
			this.statusError = undefined
			this.startHeartbeat(ws)
			this.updateConnectionStatus()
		})

		ws.on('pong', () => {
			this.heartbeatAlive = true
		})

		ws.on('message', (data) => {
			let parsed: payload
			try {
				parsed = JSON.parse(decodeFrame(data)) as payload
			} catch (err) {
				this.log('warn', `status message parse error: ${(err as Error).message}`)
				return
			}
			this.onStatusUpdate(parsed)
			this.statusError = undefined
		})
	}

	private startHeartbeat(ws: WebSocket): void {
		this.clearHeartbeat()
		this.heartbeatAlive = true
		this.heartbeatTimer = setInterval(() => {
			if (!this.heartbeatAlive) {
				this.log('warn', 'heartbeat timeout; terminating status socket')
				ws.terminate()
				return
			}
			this.heartbeatAlive = false
			try {
				ws.ping()
			} catch {
				// socket already closing
			}
		}, HEARTBEAT_INTERVAL_MS)
	}

	private scheduleTokenRefresh(expiresInSeconds: number): void {
		this.clearRefresh()
		const delayMs = Math.max(5_000, expiresInSeconds * 1000 - TOKEN_REFRESH_LEAD_MS)
		this.refreshTimer = setTimeout(() => {
			void this.refreshAccessToken()
		}, delayMs)
	}

	private async refreshAccessToken(): Promise<void> {
		if (this.shuttingDown) return
		if (!this.refreshToken || !this.accessToken) {
			this.log('warn', 'no refresh token available; forcing reconnect')
			this.forceReconnect('missing refresh token')
			return
		}
		try {
			const res = await this.refreshTokenCall(this.refreshToken, this.accessToken)
			this.accessToken = res.access_token
			if (res.refresh_token) this.refreshToken = res.refresh_token
			this.scheduleTokenRefresh(res.expires_in)
			this.log('info', 'access token refreshed')
		} catch (err) {
			const e = err as Error
			this.log('warn', `token refresh failed: ${e.message}`)
			this.forceReconnect('token refresh failed')
		}
	}

	private forceReconnect(reason: string): void {
		if (this.controlWS) {
			try {
				this.controlWS.close()
			} catch {
				/* noop */
			}
		}
		if (this.statusWS) {
			try {
				this.statusWS.close()
			} catch {
				/* noop */
			}
		}
		this.scheduleReconnect(reason)
	}

	private async signin(): Promise<m2lxauthResponse> {
		return this.httpsJson<m2lxauthResponse>(
			'POST',
			'/api/local_auth/signin',
			{ alias: this.config.user, password: this.config.pass },
			{ auth: false },
		)
	}

	private async refreshTokenCall(refreshToken: string, accessToken: string): Promise<m2lxTokenResponse> {
		return this.httpsJson<m2lxTokenResponse>(
			'POST',
			'/api/local_auth/refresh_token',
			{ refresh_token: refreshToken },
			{ auth: false, headers: { Authorization: `Bearer ${accessToken}` } },
		)
	}

	private async httpsJson<T>(
		method: 'GET' | 'POST',
		path: string,
		body: unknown = null,
		opts: { auth?: boolean; headers?: Record<string, string> } = {},
	): Promise<T> {
		const useAuth = opts.auth !== false
		const headers: Record<string, string> = { ...(opts.headers ?? {}) }
		let bodyBuf: Buffer | undefined
		if (body !== null && body !== undefined) {
			bodyBuf = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8')
			headers['Content-Type'] = headers['Content-Type'] ?? 'application/json'
			headers['Content-Length'] = String(bodyBuf.byteLength)
		}
		if (useAuth && this.accessToken && !headers.Authorization) {
			headers.Authorization = `Bearer ${this.accessToken}`
		}
		return new Promise<T>((resolve, reject) => {
			const req = https.request(
				{
					host: this.config.host,
					port: 443,
					path,
					method,
					headers,
					rejectUnauthorized: !this.allowSelfSigned,
				},
				(res) => {
					const chunks: Buffer[] = []
					res.on('data', (c: Buffer) => chunks.push(c))
					res.on('end', () => {
						const text = Buffer.concat(chunks).toString('utf8')
						if (res.statusCode && res.statusCode >= 400) {
							reject(new Error(`${method} ${path} ${res.statusCode}: ${text}`))
							return
						}
						if (!text) {
							resolve(undefined as T)
							return
						}
						try {
							resolve(JSON.parse(text) as T)
						} catch (err) {
							reject(err as Error)
						}
					})
				},
			)
			req.on('error', reject)
			if (bodyBuf) req.write(bodyBuf)
			req.end()
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
					if (this.trans_running !== is_trans_progress) {
						this.trans_running = is_trans_progress
						this.emit('feedback-transition')
					}
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
