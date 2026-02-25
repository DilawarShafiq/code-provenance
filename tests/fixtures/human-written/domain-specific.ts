/*
 Spectral flux onset detection for drum transcription.
 Based on Böck & Widmer 2013 but tweaked for low-latency use.
 The magPhase split trick is mine — halves allocations on hot path.
*/

const FRAME_SZ = 2048
const HOP = 512
const SR = 44100
const ONSET_THRESH = 1.4  // found by ear on the breakbeat dataset
const MIN_ONSET_GAP_FRAMES = Math.ceil(SR / HOP * 0.03)  // 30ms minimum

interface SpectralBin { mag: number; phase: number; prevPhase: number; prevMag: number }

export function detectOnsets(pcmFloat32: Float32Array): number[] {
    const nFrames = Math.floor((pcmFloat32.length - FRAME_SZ) / HOP) + 1
    if (nFrames < 2) return []

    const bins = FRAME_SZ / 2 + 1
    const spectrum: SpectralBin[] = Array.from({length: bins}, ()=>({
        mag: 0, phase: 0, prevPhase: 0, prevMag: 0
    }))

    const onsetFrames: number[] = []
    let lastOnset = -MIN_ONSET_GAP_FRAMES - 1  // allow first frame
    const hannWin = makeHann(FRAME_SZ)

    for(let f = 0; f < nFrames; f++){
        const offset = f * HOP
        const windowed = applyWindow(pcmFloat32, offset, FRAME_SZ, hannWin)
        const {re, im} = naiveFFT(windowed)

        let flux = 0
        for(let k = 0; k < bins; k++){
            const mag = Math.sqrt(re[k]*re[k] + im[k]*im[k])
            const phase = Math.atan2(im[k], re[k])

            // spectral flux: only count *increases* in magnitude (half-wave rect)
            const diff = mag - spectrum[k].prevMag
            if(diff > 0) flux += diff

            spectrum[k].prevMag = spectrum[k].mag
            spectrum[k].prevPhase = spectrum[k].phase
            spectrum[k].mag = mag
            spectrum[k].phase = phase
        }

        if(flux > ONSET_THRESH && (f - lastOnset) >= MIN_ONSET_GAP_FRAMES){
            onsetFrames.push(f)
            lastOnset = f
        }
    }

    return onsetFrames.map(f => f * HOP / SR)  // convert to seconds
}

function makeHann(N: number): Float32Array {
    const w = new Float32Array(N)
    for(let n = 0; n < N; n++)
        w[n] = 0.5 * (1 - Math.cos(2*Math.PI*n / (N-1)))
    return w
}

function applyWindow(buf: Float32Array, off: number, sz: number, win: Float32Array): Float32Array {
    const out = new Float32Array(sz)
    for(let i = 0; i < sz; i++) out[i] = buf[off+i] * win[i]
    return out
}

// dead simple radix-2 DIT FFT — not optimized, just needs to be correct
// we're not doing real-time here so perf doesn't matter much
function naiveFFT(x: Float32Array): {re: Float32Array; im: Float32Array} {
    const N = x.length
    const re = new Float32Array(N)
    const im = new Float32Array(N)

    // bit-reversal permutation
    for(let i=0;i<N;i++){
        let j=0, tmp=i
        for(let b=0;b<Math.log2(N);b++){
            j = (j<<1)|(tmp&1)
            tmp >>= 1
        }
        re[j] = x[i]
    }

    // butterfly passes
    for(let s=1; s<=Math.log2(N); s++){
        const m = 1 << s
        const wRe = Math.cos(2*Math.PI/m)
        const wIm = -Math.sin(2*Math.PI/m)

        for(let k=0; k<N; k+=m){
            let tRe=1, tIm=0
            for(let j=0; j<m/2; j++){
                const uRe = re[k+j], uIm = im[k+j]
                const vRe = re[k+j+m/2]*tRe - im[k+j+m/2]*tIm
                const vIm = re[k+j+m/2]*tIm + im[k+j+m/2]*tRe

                re[k+j] = uRe+vRe
                im[k+j] = uIm+vIm
                re[k+j+m/2] = uRe-vRe
                im[k+j+m/2] = uIm-vIm

                const newTRe = tRe*wRe - tIm*wIm
                tIm = tRe*wIm + tIm*wRe
                tRe = newTRe
            }
        }
    }

    return {re, im}
}
