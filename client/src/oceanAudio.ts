/** A seamless stereo surf bed, generated once after the first user gesture. */
export function createSurfBuffer(context: BaseAudioContext) {
  const duration = 18, rate = context.sampleRate
  const length = Math.round(rate * duration), overlap = Math.round(rate * .4)
  const buffer = context.createBuffer(2, length, rate)
  for (let channel = 0; channel < 2; channel++) {
    const raw = new Float32Array(length + overlap)
    let body = 0, wash = 0
    for (let i = 0; i < raw.length; i++) {
      const white = Math.random() * 2 - 1
      body += (white - body) * .018
      wash += (white - wash) * .24
      const cycle = i / length * Math.PI * 2
      const rise = .5 + .5 * Math.sin(cycle * 3 - .9 + .28 * Math.sin(cycle))
      const crest = rise * rise
      // Low rolling water and an airy wash that opens as each wave breaks.
      const sample = body * 2.8 * (.35 + crest * .65) + (wash - body) * 1.25 * (.08 + crest * .92)
      raw[i] = Math.max(-.9, Math.min(.9, sample))
    }
    const samples = buffer.getChannelData(channel)
    samples.set(raw.subarray(0, length))
    // The end flows into its original continuation; blend back to the beginning.
    for (let i = 0; i < overlap; i++) {
      const blend = i / overlap
      samples[i] = raw[length + i] * (1 - blend) + raw[i] * blend
    }
  }
  return buffer
}
