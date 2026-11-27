import { afterEach, describe, expect, it, vi } from 'vitest'
import { BattleSound } from '../battleSound'
import { createSurfBuffer } from '../oceanAudio'

function audioContext() {
  const connect = function (target: unknown) { return target }
  const gains: { gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> }; connect: typeof connect }[] = []
  const sources: { buffer: AudioBuffer | null; loop: boolean; start: ReturnType<typeof vi.fn>; connect: typeof connect }[] = []
  const context = {
    sampleRate: 8000, currentTime: 0, state: 'suspended', destination: {},
    createBuffer(channels: number, length: number, sampleRate: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length))
      return { length, numberOfChannels: channels, sampleRate, getChannelData: (channel: number) => data[channel] } as AudioBuffer
    },
    createGain() {
      const node = { gain: { value: 1, setTargetAtTime: vi.fn() }, connect }
      gains.push(node); return node
    },
    createBufferSource() {
      const node = { buffer: null as AudioBuffer | null, loop: false, start: vi.fn(), connect }
      sources.push(node); return node
    },
    createBiquadFilter: () => ({ type: '', frequency: { value: 0 }, connect }),
    resume: vi.fn(async () => { context.state = 'running' }),
    suspend: vi.fn(async () => { context.state = 'suspended' }),
  }
  return { context, gains, sources }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('ocean ambience', () => {
  it('has audible wave swells, stereo width and a continuous loop boundary', () => {
    const { context } = audioContext()
    const buffer = createSurfBuffer(context as unknown as BaseAudioContext)
    const samples = buffer.getChannelData(0), other = buffer.getChannelData(1)
    const rms = (start: number, end: number) => Math.sqrt(samples.subarray(start, end).reduce((sum, x) => sum + x * x, 0) / (end - start))
    const levels = Array.from({ length: 18 }, (_, second) => rms(second * buffer.sampleRate, (second + 1) * buffer.sampleRate))
    expect(Math.max(...levels) / Math.min(...levels)).toBeGreaterThan(2)
    expect(samples.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= .901)).toBe(true)
    expect(samples.some((sample, i) => sample !== other[i])).toBe(true)
    // A loop boundary should be no sharper than the surrounding natural noise.
    expect(Math.abs(samples[0] - samples[samples.length - 1])).toBeLessThan(.35)
  })

  it('starts only after interaction, respects mute and volume, and resumes without extra loops', async () => {
    const { context, gains, sources } = audioContext()
    const Constructor = vi.fn(function () { return context })
    vi.stubGlobal('AudioContext', Constructor)
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const sound = new BattleSound(), settings = { muted: false, effects: .6, sea: .3 }
    sound.configure(settings)
    expect(Constructor).not.toHaveBeenCalled()
    sound.unlock()
    expect(context.state).toBe('running')
    expect(gains[2].gain.value).toBe(0) // Start the ambience quietly, then fade in.
    expect(sources).toHaveLength(1)
    expect(sources[0].loop).toBe(true)
    expect(gains[2].gain.setTargetAtTime).toHaveBeenLastCalledWith(.3 * .65, 0, .45)
    sound.configure({ ...settings, muted: true })
    expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, .05)
    sound.configure({ ...settings, sea: 0 })
    expect(gains[2].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, .45)
    hidden.mockReturnValue(true); sound.visibility()
    expect(context.state).toBe('suspended')
    await Promise.resolve()
    hidden.mockReturnValue(false); sound.visibility(); sound.unlock()
    expect(context.state).toBe('running')
    expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, .05)
    expect(Constructor).toHaveBeenCalledTimes(1)
    expect(sources).toHaveLength(1)
  })
})
