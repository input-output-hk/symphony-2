import EventEmitter from 'eventemitter3'
import { map } from '../utils/math'
import GPU from 'gpu.js'

export default class Audio extends EventEmitter {
  constructor (args) {
    super(args)
    this.gpu = new GPU()
    this.audioContext = new window.AudioContext()
    this.masterBus = this.audioContext.createGain()

    this.compressor = this.audioContext.createDynamicsCompressor()
    this.compressor.threshold.setValueAtTime(-30, this.audioContext.currentTime)
    this.compressor.knee.setValueAtTime(40, this.audioContext.currentTime)
    this.compressor.ratio.setValueAtTime(5, this.audioContext.currentTime)
    this.compressor.attack.setValueAtTime(0, this.audioContext.currentTime)
    this.compressor.release.setValueAtTime(1.0, this.audioContext.currentTime)

    const getImpulseBuffer = (audioContext, impulseUrl) => {
      return window.fetch(impulseUrl)
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
    }

    this.convolver = this.audioContext.createConvolver()

    getImpulseBuffer(this.audioContext, './assets/sounds/IR/EchoBridge.wav').then((buffer) => {
      this.convolver.buffer = buffer
      this.masterBus.connect(this.compressor)
      this.compressor.connect(this.convolver)
      this.convolver.connect(this.audioContext.destination)
    })

    this.sampleRate = 44100
    this.soundDuration = 40 // (seconds)
    this.notes = {
      27.5000: 'A0',
      29.1352: 'A#0',
      30.8677: 'B0',
      32.7032: 'C1',
      34.6478: 'C#1',
      36.7081: 'D1',
      38.8909: 'D#1',
      41.2034: 'E1',
      43.6535: 'F1',
      46.2493: 'F#1',
      48.9994: 'G1',
      51.9131: 'G#1',
      55.000: 'A1',
      58.2705: 'A#1',
      61.7354: 'B1',
      65.4064: 'C2',
      69.2957: 'C#2',
      73.4162: 'D2',
      77.7817: 'D#2',
      82.4069: 'E2',
      87.3071: 'F2',
      92.4986: 'F#2',
      97.9989: 'G2',
      103.826: 'G#2',
      110.000: 'A2',
      116.541: 'A#2',
      123.471: 'B2',
      130.813: 'C3',
      138.591: 'C#3',
      146.832: 'D3',
      155.563: 'D#3',
      164.814: 'E3',
      174.614: 'F3',
      184.997: 'F#3',
      195.998: 'G3',
      207.652: 'G#3',
      220.000: 'A3',
      233.082: 'A#3',
      246.942: 'B3',
      261.626: 'C4',
      277.183: 'C#4',
      293.665: 'D4',
      311.127: 'D#4',
      329.628: 'E4',
      349.228: 'F4',
      369.994: 'F#4',
      391.995: 'G4',
      415.305: 'G#4',
      440.000: 'A4',
      466.164: 'A#4',
      493.883: 'B4',
      523.251: 'C5',
      554.365: 'C#5',
      587.330: 'D5',
      622.254: 'D#5',
      659.255: 'E5',
      698.456: 'F5',
      739.989: 'F#5',
      783.991: 'G5',
      830.609: 'G#5',
      880.000: 'A5',
      932.328: 'A#5',
      987.767: 'B5',
      1046.50: 'C6',
      1108.73: 'C#6',
      1174.66: 'D6',
      1244.51: 'D#6',
      1318.51: 'E6',
      1396.91: 'F6',
      1479.98: 'F#6',
      1567.98: 'G6',
      1661.22: 'G#6',
      1760.00: 'A6',
      1864.66: 'A#6',
      1975.53: 'B6',
      2093.00: 'C7',
      2217.46: 'C#7',
      2349.32: 'D7',
      2489.02: 'D#7',
      2637.02: 'E7',
      2793.83: 'F7',
      2959.96: 'F#7',
      3135.96: 'G7',
      3322.44: 'G#7',
      3520.00: 'A7',
      3729.31: 'A#7',
      3951.07: 'B7',
      4186.01: 'C8',
      4434.92: 'C#8',
      4698.63: 'D8',
      4978.03: 'D#8',
      5274.04: 'E8',
      5587.65: 'F8',
      5919.91: 'F#8',
      6271.93: 'G8',
      6644.88: 'G#8',
      7040.00: 'A8',
      7458.62: 'A#8',
      7902.13: 'B8'
    }

    this.modes = {
      // 'ionian': [
      //   'C',
      //   'D',
      //   'E',
      //   'F',
      //   'G',
      //   'A',
      //   'B',
      //   'C'
      // ],
      // 'dorian': [
      //   'C',
      //   'D',
      //   'D#',
      //   'F',
      //   'G',
      //   'A',
      //   'A#',
      //   'C'
      // ],
      // 'phrygian': [
      //   'C',
      //   'C#',
      //   'D#',
      //   'F',
      //   'G',
      //   'G#',
      //   'A#',
      //   'C'
      // ],
      // 'lydian': [
      //   'C',
      //   'D',
      //   'E',
      //   'F#',
      //   'G',
      //   'A',
      //   'B',
      //   'C'
      // ],
      // 'mixolydian': [
      //   'C',
      //   'D',
      //   'E',
      //   'F',
      //   'G',
      //   'A',
      //   'A#',
      //   'C'
      // ],
      'aeolian': [
        'C',
        'D',
        'D#',
        'F',
        'G',
        'G#',
        'A#',
        'C'
      ]
      // 'locrian': [
      //   'C',
      //   'C#',
      //   'D#',
      //   'F',
      //   'F#',
      //   'G#',
      //   'A#',
      //   'C'
      // ]
    }
    this.buffers = []
    this.gainNodes = []
    this.audioSources = []
    this.loops = []
  }

  async generate (blockData) {
    // compute number from hash
    let total = 0
    for (let i = 0; i < blockData.hash.length; i++) {
      // convert from base 16
      total += parseInt(blockData.hash[i], 16)
    }

    // set unique mode for this block hash
    let modeIndex = total % Object.keys(this.modes).length
    this.mode = this.modes[Object.keys(this.modes)[modeIndex]]

    let minOutput = Number.MAX_SAFE_INTEGER
    let maxOutput = 0

    if (blockData.tx.length === 1) {
      minOutput = 0
      maxOutput = blockData.tx[0].value * 2
    } else {
      for (let index = 0; index < blockData.tx.length; index++) {
        const transaction = blockData.tx[index]
        minOutput = Math.min(transaction.value, minOutput)
        maxOutput = Math.max(transaction.value, maxOutput)
      }
    }

    minOutput = Math.log(minOutput + 1.0)
    maxOutput = Math.log(maxOutput + 1.0)

    // filter out notes not in mode
    let filteredNotes = {}
    for (const frequency in this.notes) {
      if (this.notes.hasOwnProperty(frequency)) {
        const note = this.notes[frequency]
        const noteName = note.replace(/[0-9]/g, '')
        if (this.mode.indexOf(noteName) !== -1) { // filter out notes not in mode
          filteredNotes[frequency] = note
        }
      }
    }

    console.log(blockData.tx.length)

    this.buffers[blockData.height] = this.audioContext.createBuffer(2, this.sampleRate * this.soundDuration, this.sampleRate)

    let frequencies = []

    this.times = []

    let health = (blockData.fee / blockData.outputTotal) * 2000 // 0 == healthy

    console.log({health})

    let spent = []

    for (const txKey in blockData.tx) {
      if (blockData.tx.hasOwnProperty(txKey)) {
        const tx = blockData.tx[txKey]

        let txTime = map(txKey, 0, Object.keys(blockData.tx).length, 0, 30)
        this.times.push(txTime)

        let spentCount = 0
        for (let index = 0; index < tx.out.length; index++) {
          spentCount += tx.out[index].spent
        }

        let mappedSpentRatio = map((1.0 - (spentCount / tx.out.length)), 1.0, 0.0, 16.0, 1.0)

        spent.push(mappedSpentRatio)

        let pitchIndex = Math.floor(map(Math.log(tx.value + 1.0), minOutput, maxOutput, Object.keys(filteredNotes).length, 0))

        let i = 0
        for (const frequency in filteredNotes) {
          if (filteredNotes.hasOwnProperty(frequency)) {
            if (pitchIndex === i) {
              frequencies.push(parseFloat(frequency))
              break
            }
            i++
          }
        }
      }
    }

    // keep standard js happy
    let custom_smoothstep = () => {}
    let custom_step = () => {}
    let custom_random = () => {}

    const sineBank = this.gpu.createKernel(function (frequencies, times, spent, vol, health, channel) {
      let sum = 0
      let PI = 3.14159265359
      let currentTime = (this.thread.x / this.constants.sampleRate)

      for (var i = 0; i < this.constants.size; i++) {
        let ANGULAR_FREQUENCY = frequencies[i] * 2.0 * PI

        let ANGULAR_FREQUENCY_MOD = (frequencies[i] + (Math.sin(channel + currentTime * (custom_random(ANGULAR_FREQUENCY + channel) * 0.1)) * health * 2 - health)) * 2.0 * PI

        let currentAngle = currentTime * ANGULAR_FREQUENCY
        let currentAngleMod = currentTime * ANGULAR_FREQUENCY_MOD

        let time = times[i]
        let spentRatio = spent[i]

        // envelope
        let attack = custom_smoothstep(time, time + 5.0, currentTime)
        let release = (1.0 - custom_smoothstep(time + 5.0, time + 10.0, currentTime))

        let spent1 = custom_step(1.0, spentRatio)
        let spent2 = custom_step(2.0, spentRatio)
        let spent3 = custom_step(3.0, spentRatio)
        let spent4 = custom_step(4.0, spentRatio)
        let spent5 = custom_step(5.0, spentRatio)
        let spent6 = custom_step(6.0, spentRatio)
        let spent7 = custom_step(7.0, spentRatio)
        let spent8 = custom_step(8.0, spentRatio)
        let spent9 = custom_step(9.0, spentRatio)
        let spent10 = custom_step(10.0, spentRatio)
        let spent11 = custom_step(11.0, spentRatio)
        let spent12 = custom_step(12.0, spentRatio)
        let spent13 = custom_step(13.0, spentRatio)
        let spent14 = custom_step(14.0, spentRatio)
        let spent15 = custom_step(15.0, spentRatio)
        let spent16 = custom_step(16.0, spentRatio)

        let wave = Math.sin(currentAngle * (1.0 + (custom_random(ANGULAR_FREQUENCY * 1.0 + channel) * health))) * spent1 +
                Math.sin(currentAngleMod * (2.0 + (custom_random(ANGULAR_FREQUENCY * 2.0 + channel) * health))) * spent2 +
                Math.sin(currentAngleMod * (3.0 + (custom_random(ANGULAR_FREQUENCY * 3.0 + channel) * health))) * spent3 +
                Math.sin(currentAngleMod * (4.0 + (custom_random(ANGULAR_FREQUENCY * 4.0 + channel) * health))) * spent4 +
                Math.sin(currentAngleMod * (5.0 + (custom_random(ANGULAR_FREQUENCY * 5.0 + channel) * health))) * spent5 +
                Math.sin(currentAngleMod * (6.0 + (custom_random(ANGULAR_FREQUENCY * 6.0 + channel) * health))) * spent6 +
                Math.sin(currentAngleMod * (7.0 + (custom_random(ANGULAR_FREQUENCY * 7.0 + channel) * health))) * spent7 +
                Math.sin(currentAngleMod * (8.0 + (custom_random(ANGULAR_FREQUENCY * 8.0 + channel) * health))) * spent8 +
                Math.sin(currentAngleMod * (9.0 + (custom_random(ANGULAR_FREQUENCY * 9.0 + channel) * health))) * spent9 +
                Math.sin(currentAngleMod * (10.0 + (custom_random(ANGULAR_FREQUENCY * 10.0 + channel) * health))) * spent10 +
                Math.sin(currentAngleMod * (11.0 + (custom_random(ANGULAR_FREQUENCY * 11.0 + channel) * health))) * spent11 +
                Math.sin(currentAngleMod * (12.0 + (custom_random(ANGULAR_FREQUENCY * 12.0 + channel) * health))) * spent12 +
                Math.sin(currentAngleMod * (13.0 + (custom_random(ANGULAR_FREQUENCY * 13.0 + channel) * health))) * spent13 +
                Math.sin(currentAngleMod * (14.0 + (custom_random(ANGULAR_FREQUENCY * 14.0 + channel) * health))) * spent14 +
                Math.sin(currentAngleMod * (15.0 + (custom_random(ANGULAR_FREQUENCY * 15.0 + channel) * health))) * spent15 +
                Math.sin(currentAngleMod * (16.0 + (custom_random(ANGULAR_FREQUENCY * 16.0 + channel) * health))) * spent16

        wave /= 16

        sum += wave * attack * release * vol
      }

      return sum
    }, {
      constants: {
        size: frequencies.length,
        sampleRate: this.sampleRate
      }
    }).setOutput([this.sampleRate * this.soundDuration])

    sineBank.addNativeFunction('custom_smoothstep', `highp float custom_smoothstep(float edge0, float edge1, float x) {
        return smoothstep(edge0, edge1, x);
    }`)

    sineBank.addNativeFunction('custom_step', `highp float custom_step(float edge, float x) {
        return step(edge, x);
    }`)

    sineBank.addNativeFunction('custom_random', `highp float custom_random(float n){
        return fract(sin(n) * 43758.5453123);
    }`)

    let vol = this.getVol(frequencies.length)
    console.time('sineBank')
    let sineArrayL = sineBank(frequencies, this.times, spent, vol, health, 0)
    let sineArrayR = sineBank(frequencies, this.times, spent, vol, health, 1)
    console.timeEnd('sineBank')

    console.time('fillBuffer')
    let lArray = this.buffers[blockData.height].getChannelData(0)
    let rArray = this.buffers[blockData.height].getChannelData(1)
    for (let index = 0; index < sineArrayL.length; index++) {
      lArray[index] = sineArrayL[index]
      rArray[index] = sineArrayR[index]
    }
    console.timeEnd('fillBuffer')

    this.audioSources[blockData.height] = this.audioContext.createBufferSource()
    this.audioSources[blockData.height].buffer = this.buffers[blockData.height]

    /* let biquadFilter = audioContext.createBiquadFilter()
    biquadFilter.type = 'notch'
    biquadFilter.frequency.setValueAtTime(2000, audioContext.currentTime)
    biquadFilter.gain.setValueAtTime(-20, audioContext.currentTime)
    biquadFilter.Q.setValueAtTime(300, audioContext.currentTime) */

    /* let lsFilter = audioContext.createBiquadFilter()
    lsFilter.type = 'lowshelf'
    lsFilter.frequency.setValueAtTime(250, audioContext.currentTime)
    lsFilter.gain.setValueAtTime(10, audioContext.currentTime)
    lsFilter.Q.setValueAtTime(300, audioContext.currentTime) */

    this.gainNodes[blockData.height] = this.audioContext.createGain()

    this.audioSources[blockData.height].connect(this.gainNodes[blockData.height])

    this.gainNodes[blockData.height].connect(this.masterBus)

    this.audioSources[blockData.height].loop = true

    let loop = () => {
      this.loops[blockData.height] = setTimeout(function () {
        this.emit('loopend')
        loop()
      }.bind(this), this.soundDuration * 1000)
    }

    loop()

    this.audioSources[blockData.height].start()
  }

  getVol (frequencies) {
    let noteLength = 3.0
    let vol = (this.soundDuration / noteLength) / frequencies

    if (vol > 0.5) {
      return 0.5
    } else {
      return vol
    }
  }
}
