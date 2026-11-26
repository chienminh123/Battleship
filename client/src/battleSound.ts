import type { GameShotStatus } from './types'

type SoundSettings = { muted: boolean; effects: number; sea: number; playing: boolean }

// Synthesized locally: no downloads, audio licensing, or network latency per shot.
class BattleSound {
  private context?: AudioContext
  private master?: GainNode
  private effects?: GainNode
  private ambience?: GainNode
  private noise?: AudioBuffer
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private settings: SoundSettings = { muted: false, effects: .65, sea: .12, playing: false }

  unlock() {
    try {
      if (!this.context) {
        const context = new AudioContext()
        this.context = context
        this.master = context.createGain()
        this.master.connect(context.destination)
        this.effects = context.createGain()
        this.effects.connect(this.master)
        this.ambience = context.createGain()
        this.ambience.connect(this.master)
        const noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate)
        const samples = noise.getChannelData(0)
        let previous = 0
        for (let i = 0; i < samples.length; i++) {
          previous = (previous + (Math.random() * 2 - 1) * .035) / 1.035
          samples[i] = previous * 6
        }
        this.noise = noise
        const sea = context.createBufferSource()
        sea.buffer = noise; sea.loop = true
        const filter = context.createBiquadFilter()
        filter.type = 'lowpass'; filter.frequency.value = 420
        sea.connect(filter).connect(this.ambience); sea.start()
        this.configure(this.settings)
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {})
    } catch { /* Audio is optional; gameplay continues if unavailable. */ }
  }

  configure(settings: SoundSettings) {
    this.settings = settings
    const time = this.context?.currentTime ?? 0
    this.master?.gain.setTargetAtTime(settings.muted || document.hidden ? 0 : 1, time, .05)
    this.effects?.gain.setTargetAtTime(settings.effects, time, .05)
    this.ambience?.gain.setTargetAtTime(settings.playing ? settings.sea * .35 : 0, time, .3)
  }

  visibility() { this.configure(this.settings) }

  private later(callback: () => void, delay: number) {
    const timer = setTimeout(() => { this.timers.delete(timer); callback() }, delay)
    this.timers.add(timer)
  }

  cancel() {
    this.timers.forEach(clearTimeout)
    this.timers.clear()
  }

  private burst(duration: number, frequency: number, volume: number, delay = 0) {
    const context = this.context
    if (!context || !this.noise || !this.effects) return
    const start = context.currentTime + delay
    const source = context.createBufferSource()
    source.buffer = this.noise
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(frequency, start)
    filter.frequency.exponentialRampToValueAtTime(75, start + duration)
    const gain = context.createGain()
    gain.gain.setValueAtTime(.001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + .015)
    gain.gain.exponentialRampToValueAtTime(.001, start + duration)
    source.connect(filter).connect(gain).connect(this.effects)
    source.start(start); source.stop(start + duration)
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect() }
  }

  private tone(frequency: number, duration: number, delay = 0, volume = .15) {
    const context = this.context
    if (!context || !this.effects) return
    const start = context.currentTime + delay
    const oscillator = context.createOscillator()
    oscillator.type = 'sine'; oscillator.frequency.value = frequency
    const gain = context.createGain()
    gain.gain.setValueAtTime(.001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + .015)
    gain.gain.exponentialRampToValueAtTime(.001, start + duration)
    oscillator.connect(gain).connect(this.effects)
    oscillator.start(start); oscillator.stop(start + duration)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  }

  shot(status: GameShotStatus) {
    if (!this.context || this.context.state !== 'running' || document.hidden || this.settings.muted) return
    this.burst(.25, 220, .65)
    this.tone(62, .25, 0, .3)
    if (status === 'Miss') {
      this.burst(.55, 2200, .6, .28)
    } else {
      this.burst(status === 'Sunk' || status === 'Won' ? 1.25 : .6, 1300, .95, .28)
      this.tone(44, .55, .28, .35)
      if (status === 'Sunk' || status === 'Won') this.burst(.9, 650, .6, .65)
    }
  }

  result(won: boolean) {
    this.later(() => {
      if (this.context?.state !== 'running' || document.hidden || this.settings.muted) return
      const notes = won ? [261.63, 329.63, 392, 523.25] : [220, 196, 164.81, 130.81]
      notes.forEach((note, i) => this.tone(note, .55, i * .16, .14))
    }, 0)
  }
}

export const battleSound = new BattleSound()
