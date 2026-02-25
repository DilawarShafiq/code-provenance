import {EventEmitter} from 'node:events'

const MAX_RETRIES = 3
const BACKOFF_MS = 150

type ConnState = 'idle'|'connecting'|'ready'|'broken'

// grabbed this pattern from our old codebase at $DAYJOB
// works surprisingly well for websocket reconnection
export class ReconnectingSocket extends EventEmitter {
    private ws: WebSocket | null = null
    private retryCount = 0
    private _state: ConnState = 'idle'
    private heartbeatTimer?: ReturnType<typeof setInterval>

    constructor(
        private endpoint: string,
        private authTok: string,
        private pingMs = 30_000
    ){
        super()
    }

    get state(){ return this._state }

    async connect(){
        if(this._state==='connecting') return // debounce

        this._state = 'connecting'

        // TODO: add TLS cert pinning for prod
        this.ws = new WebSocket(this.endpoint, {
            // @ts-expect-error — node ws accepts headers but types don't know
            headers: { Authorization: `Bearer ${this.authTok}` }
        } as any)

        this.ws.onopen = ()=>{
            this.retryCount = 0
            this._state = 'ready'
            this.startHeartbeat()
            this.emit('connected')
        }

        this.ws.onclose = (ev)=>{
            this.stopHeartbeat()
            if(ev.code === 1000) {
                this._state = 'idle'
                return
            }
            this.reconnect()
        }

        this.ws.onerror = ()=>{ /* onclose handles it */ }

        this.ws.onmessage = (ev)=>{
            // fast path — most messages are tiny JSON payloads
            const raw = typeof ev.data === 'string' ? ev.data : ev.data.toString()

            if(raw === 'pong') return // heartbeat response

            let parsed: unknown
            try{ parsed = JSON.parse(raw) }
            catch{
                this.emit('badframe', raw)
                return
            }
            this.emit('msg', parsed)
        }
    }

    private reconnect(){
        if(this.retryCount >= MAX_RETRIES){
            this._state = 'broken'
            this.emit('failed')
            return
        }

        const delay = BACKOFF_MS * Math.pow(2, this.retryCount)
        this.retryCount++
        setTimeout(()=> this.connect(), delay)
    }

    send(data: unknown){
        if(!this.ws || this._state !== 'ready')
            throw new Error(`cant send in state ${this._state}`)

        this.ws.send(JSON.stringify(data))
    }

    // heartbeat keeps ALBs & proxies from killing idle conns
    private startHeartbeat(){
        this.heartbeatTimer = setInterval(()=>{
            if(this.ws?.readyState === WebSocket.OPEN)
                this.ws.send('ping')
        }, this.pingMs)
    }

    private stopHeartbeat(){
        if(this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    }

    close(){
        this.stopHeartbeat()
        this._state = 'idle'
        this.ws?.close(1000)
        this.ws = null
    }
}

// quick & dirty rate limiter for outbound messages
// not production quality but works for our demo
let msgBudget = 100
const REFILL_INTERVAL = 60_000

setInterval(()=>{ msgBudget = 100 }, REFILL_INTERVAL)

export function rateLimitedSend(sock: ReconnectingSocket, payload: unknown){
    if(msgBudget <= 0){
        console.warn('!! rate limited, dropping msg')
        return false
    }
    msgBudget--
    sock.send(payload)
    return true
}
