import EventEmitter from 'eventemitter3'
import { map } from '../../utils/math'

// keep standard js happy
let custom_smoothstep = () => {}
let custom_step = () => {}
let custom_random = () => {}

export default class Audio extends EventEmitter {
  constructor (args) {
    super(args)

    this.sampleRate = args.sampleRate
    this.soundDuration = args.soundDuration
    this.noteDuration = args.noteDuration
    this.config = args.config

    this.customSmoothstep = `highp float custom_smoothstep(float edge0, float edge1, float x) {
      return smoothstep(edge0, edge1, x);
    }`
    this.customStep = `highp float custom_step(float edge, float x) {
           return step(edge, x);
         }`
    this.customRandom = `highp float custom_random(float n){
           return fract(sin(n) * 43758.5453123);
         }`
  }

  generateBlockAudio (blockData, chords, notes, TXValues, spentRatios) {
    // compute number from hash
    let total = 0
    for (let i = 0; i < blockData.hash.length; i++) {
      // convert from base 16
      total += parseInt(blockData.hash[i], 16)
    }

    // // set unique mode for this block hash
    let modeIndex = total % Object.keys(chords).length
    let mode = chords[Object.keys(chords)[modeIndex]]
    // let mode = chords['dorian']

    let minOutput = Number.MAX_SAFE_INTEGER
    let maxOutput = 0

    if (blockData.n_tx === 1) {
      minOutput = 0
      maxOutput = TXValues[0] * 2
    } else {
      for (let index = 0; index < blockData.n_tx; index++) {
        const txValue = TXValues[index]
        minOutput = Math.min(txValue, minOutput)
        maxOutput = Math.max(txValue, maxOutput)
      }
    }

    minOutput = Math.log(minOutput + 1.0)
    maxOutput = Math.log(maxOutput + 1.0)

    if (minOutput === maxOutput) {
      minOutput -= (minOutput * 0.5)
      maxOutput += (maxOutput * 0.5)
    }

    // filter out notes not in mode
    let filteredNotes = {}
    for (const frequency in notes) {
      if (notes.hasOwnProperty(frequency)) {
        const note = notes[frequency]
        const noteName = note.replace(/[0-9]/g, '')
        if (mode.indexOf(noteName) !== -1) { // filter out notes not in mode
          filteredNotes[frequency] = note
        }
      }
    }

    let frequencies = []

    let health = (blockData.fee / blockData.outputTotal) * 2000 // 0 == healthy

    let spent = []

    let txTimes = []
    const txCount = blockData.n_tx > this.config.audio.maxSineBankLoops ? this.config.audio.maxSineBankLoops : blockData.n_tx

    for (let i = 0; i < txCount; i++) {
      const txValue = TXValues[i]

      const txSpentRatio = spentRatios[i]

      let txTime = map(i, 0, txCount, 0, this.soundDuration - 4)
      txTimes.push(txTime)

      let mappedSpentRatio = map((1.0 - (txSpentRatio)), 1.0, 0.0, 8.0, 1.0)

      spent.push(mappedSpentRatio)

      const filteredNoteKeys = Object.keys(filteredNotes)

      let pitchIndex = Math.floor(map(Math.log(txValue + 1.0), minOutput, maxOutput, filteredNoteKeys.length - 1, 0))

      let j = 0
      for (const frequency in filteredNotes) {
        if (filteredNotes.hasOwnProperty(frequency)) {
          if (pitchIndex === j) {
            frequencies.push(parseFloat(frequency))
            break
          }
          j++
        }
      }
    }

    return {
      frequencies: frequencies,
      txTimes: txTimes,
      spent: spent,
      health: health
    }
  }

  fillBuffer (sineArray, vol = 1.0, lArray, rArray) {
    let min = Number.MAX_SAFE_INTEGER
    let max = 0
    for (let index = 0; index < sineArray.length; index++) {
      min = Math.min(min, sineArray[index])
      max = Math.max(max, sineArray[index])
    }

    // normalize
    for (let index = 0; index < sineArray.length; index++) {
      lArray[index] = map(sineArray[index], min, max, -vol, vol)
      if (typeof sineArray[index + 200] !== 'undefined') {
        rArray[index] = map(sineArray[index + 200], min, max, -vol, vol) // right channel slightly out of phase with left for stereo effect
      }
    }

    // return {
    //   lArray: lArray,
    //   rArray: rArray
    // }
  }

  sineBank (
    frequencies,
    times,
    spent,
    health,
    length,
    sampleRate,
    timeOffset,
    chunkIndex
  ) {
    let sum = 0
    let twoPI = 6.28318530718
    let currentTime = (this.thread.x / sampleRate) + timeOffset

    for (let i = 0; i + chunkIndex < length; i++) {
      let time = times[i + chunkIndex]
      // if (Math.abs(currentTime - time) < 8) {
      let ANGULAR_FREQUENCY = frequencies[i + chunkIndex] * twoPI

      let ANGULAR_FREQUENCY_MOD = (frequencies[i + chunkIndex] + (Math.sin(currentTime * (custom_random(ANGULAR_FREQUENCY) * 0.1)) * (health * 10.0))) * twoPI

      let currentAngle = currentTime * ANGULAR_FREQUENCY

      let currentAngleMod = currentTime * ANGULAR_FREQUENCY_MOD

      let spentRatio = spent[i + chunkIndex]

      // envelope
      let attack = custom_smoothstep(time, (time + 0.1) + (custom_random(i) * 2.0), currentTime)
      let release = (1.0 - custom_smoothstep(time + 2.0, (time + 3.0), currentTime))

      let spent1 = 1.5
      let spent2 = 0.1 + custom_step(2.0, spentRatio) * 1.0
      let spent3 = 0.1 + custom_step(3.0, spentRatio) * 0.9
      let spent4 = 0.1 + custom_step(4.0, spentRatio) * 0.8
      let spent5 = 0.1 + custom_step(5.0, spentRatio) * 0.7
      let spent6 = 0.1 + custom_step(6.0, spentRatio) * 0.6
      let spent7 = 0.1 + custom_step(7.0, spentRatio) * 0.5
      let spent8 = 0.1 + custom_step(8.0, spentRatio) * 0.4

      let wave = Math.sin(currentAngleMod) * spent1 +
        Math.sin(currentAngleMod * (2.0 + (custom_random(ANGULAR_FREQUENCY * 2.0) * health))) * spent2 +
        Math.sin(currentAngleMod * (3.0 + (custom_random(ANGULAR_FREQUENCY * 3.0) * health))) * spent3 +
        Math.sin(currentAngleMod * (4.0 + (custom_random(ANGULAR_FREQUENCY * 4.0) * health))) * spent4 +
        Math.sin(currentAngleMod * (5.0 + (custom_random(ANGULAR_FREQUENCY * 5.0) * health))) * spent5 +
        Math.sin(currentAngleMod * (6.0 + (custom_random(ANGULAR_FREQUENCY * 6.0) * health))) * spent6 +
        Math.sin(currentAngleMod * (7.0 + (custom_random(ANGULAR_FREQUENCY * 7.0) * health))) * spent7 +
        Math.sin(currentAngleMod * (8.0 + (custom_random(ANGULAR_FREQUENCY * 8.0) * health))) * spent8

      wave *= Math.max(Math.sin(currentTime * Math.floor(custom_random(ANGULAR_FREQUENCY) * 30.0)), custom_random(i))

      sum += wave * attack * release
      // }
    }

    return sum
  }

  txAudio (frequency, spent, health, sampleRate) {
    let sum = 0
    let twoPI = 6.28318530718
    let currentTime = (this.thread.x / sampleRate)

    let ANGULAR_FREQUENCY = frequency * twoPI

    let currentAngle = currentTime * ANGULAR_FREQUENCY

    let spentRatio = spent

    // envelope
    let attack = custom_smoothstep(0.0, 5.0, currentTime)
    let release = (1.0 - custom_smoothstep(5.0, 10.0, currentTime))

    let spent1 = 1.5
    let spent2 = 0.2 + custom_step(2.0, spentRatio) * 1.0
    let spent3 = 0.2 + custom_step(3.0, spentRatio) * 0.9
    let spent4 = 0.2 + custom_step(4.0, spentRatio) * 0.8
    let spent5 = 0.2 + custom_step(5.0, spentRatio) * 0.7
    let spent6 = 0.2 + custom_step(6.0, spentRatio) * 0.6
    let spent7 = 0.2 + custom_step(7.0, spentRatio) * 0.5
    // let spent8 = 0.2 + custom_step(8.0, spentRatio) * 0.4

    let wave = Math.sin(currentAngle) * spent1 +
    Math.sin(currentAngle * (2.0 + (custom_random(ANGULAR_FREQUENCY * 2.0) * health))) * spent2 +
    Math.sin(currentAngle * (3.0 + (custom_random(ANGULAR_FREQUENCY * 3.0) * health))) * spent3 +
    Math.sin(currentAngle * (4.0 + (custom_random(ANGULAR_FREQUENCY * 4.0) * health))) * spent4 +
    Math.sin(currentAngle * (5.0 + (custom_random(ANGULAR_FREQUENCY * 5.0) * health))) * spent5 +
    Math.sin(currentAngle * (6.0 + (custom_random(ANGULAR_FREQUENCY * 6.0) * health))) * spent6 +
    Math.sin(currentAngle * (7.0 + (custom_random(ANGULAR_FREQUENCY * 7.0) * health))) * spent7
    // Math.sin(currentAngle * (8.0 + (custom_random(ANGULAR_FREQUENCY * 8.0) * health))) * spent8

    wave *= Math.max(Math.sin(currentTime * Math.floor(custom_random(ANGULAR_FREQUENCY) * 20.0)), 0.23)

    sum += wave * attack * release

    return sum
  }
}
