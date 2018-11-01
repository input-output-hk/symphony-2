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

  generateBlockAudio (blockData, modes, notes) {
    // compute number from hash
    let total = 0
    for (let i = 0; i < blockData.hash.length; i++) {
      // convert from base 16
      total += parseInt(blockData.hash[i], 16)
    }

    // set unique mode for this block hash
    let modeIndex = total % Object.keys(modes).length
    let mode = modes[Object.keys(modes)[modeIndex]]

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
    const txCount = blockData.tx.length > 1500 ? 1500 : blockData.tx.length

    for (let i = 0; i < txCount; i++) {
      const tx = blockData.tx[i]

      let txTime = map(i, 0, txCount, 0, this.soundDuration - 5)
      txTimes.push(txTime)

      let spentCount = 0
      for (let index = 0; index < tx.out.length; index++) {
        spentCount += tx.out[index].spent
      }

      let mappedSpentRatio = map((1.0 - (spentCount / tx.out.length)), 1.0, 0.0, 8.0, 1.0)

      spent.push(mappedSpentRatio)

      const filteredNoteKeys = Object.keys(filteredNotes)

      let pitchIndex = Math.floor(map(Math.log(tx.value + 1.0), minOutput, maxOutput, filteredNoteKeys.length, 0))

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

  fillBuffer (sineArray) {
    let lArray = new Float32Array(this.sampleRate * this.soundDuration)
    let rArray = new Float32Array(this.sampleRate * this.soundDuration)
    let min = Number.MAX_SAFE_INTEGER
    let max = 0
    for (let index = 0; index < sineArray.length; index++) {
      min = Math.min(min, sineArray[index])
      max = Math.max(max, sineArray[index])
    }

    // normalize
    for (let index = 0; index < sineArray.length; index++) {
      lArray[index] = map(sineArray[index], min, max, -0.5, 0.5)
      if (typeof sineArray[index + 100] !== 'undefined') {
        rArray[index] = map(sineArray[index + 100], min, max, -0.5, 0.5) // right channel slightly out of phase with left for stereo effect
      }
    }

    return {
      lArray: lArray,
      rArray: rArray
    }
  }

  sineBank (frequencies, times, spent, health, length, sampleRate, timeOffset, chunkIndex) {
    let sum = 0
    let twoPI = 6.28318530718
    let currentTime = (this.thread.x / sampleRate) + timeOffset

    for (let i = 0; i + chunkIndex < length; i++) {
      let time = times[i + chunkIndex]
      if (Math.abs(currentTime - time) < 6) {
        let ANGULAR_FREQUENCY = frequencies[i + chunkIndex] * twoPI

        let ANGULAR_FREQUENCY_MOD = (frequencies[i + chunkIndex] + (Math.sin(currentTime * (custom_random(ANGULAR_FREQUENCY) * 0.1)) * health * 2 - health)) * twoPI

        let currentAngle = currentTime * ANGULAR_FREQUENCY
        let currentAngleMod = currentTime * ANGULAR_FREQUENCY_MOD

        let spentRatio = spent[i + chunkIndex]

        // envelope
        let attack = custom_smoothstep(time, time + 2.0, currentTime)
        let release = (1.0 - custom_smoothstep(time + 2.0, time + 4.0, currentTime))

        let spent1 = 1.0
        let spent2 = custom_step(2.0, spentRatio)
        let spent3 = custom_step(3.0, spentRatio)
        let spent4 = custom_step(4.0, spentRatio)
        let spent5 = custom_step(5.0, spentRatio)
        let spent6 = custom_step(6.0, spentRatio)
        let spent7 = custom_step(7.0, spentRatio)
        let spent8 = custom_step(8.0, spentRatio)

        let wave = Math.sin(currentAngle * (1.0 + (custom_random(ANGULAR_FREQUENCY * 1.0) * health))) * spent1 +
        Math.sin(currentAngleMod * (2.0 + (custom_random(ANGULAR_FREQUENCY * 2.0) * health))) * spent2 +
        Math.sin(currentAngleMod * (3.0 + (custom_random(ANGULAR_FREQUENCY * 3.0) * health))) * spent3 +
        Math.sin(currentAngleMod * (4.0 + (custom_random(ANGULAR_FREQUENCY * 4.0) * health))) * spent4 +
        Math.sin(currentAngleMod * (5.0 + (custom_random(ANGULAR_FREQUENCY * 5.0) * health))) * spent5 +
        Math.sin(currentAngleMod * (6.0 + (custom_random(ANGULAR_FREQUENCY * 6.0) * health))) * spent6 +
        Math.sin(currentAngleMod * (7.0 + (custom_random(ANGULAR_FREQUENCY * 7.0) * health))) * spent7 +
        Math.sin(currentAngleMod * (8.0 + (custom_random(ANGULAR_FREQUENCY * 8.0) * health))) * spent8

        sum += wave * attack * release
      }
    }

    return sum
  }
}
