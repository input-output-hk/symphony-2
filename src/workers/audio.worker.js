import GPU from 'gpu.js'
import { map } from '../utils/math'

const sampleRate = 22050
const soundDuration = 20

// keep standard js happy
let custom_smoothstep = () => {}
let custom_step = () => {}
let custom_random = () => {}

const gpu = new GPU()

const sineBank = gpu.createKernel(function (frequencies, times, spent, vol, health, length) {
  let sum = 0
  let twoPI = 6.28318530718
  let currentTime = (this.thread.x / 22050)

  for (var i = 0; i < length; i++) {
    let ANGULAR_FREQUENCY = frequencies[i] * twoPI

    let ANGULAR_FREQUENCY_MOD = (frequencies[i] + (Math.sin(currentTime * (custom_random(ANGULAR_FREQUENCY) * 0.1)) * health * 2 - health)) * twoPI

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
    //   let spent9 = custom_step(9.0, spentRatio)
    //   let spent10 = custom_step(10.0, spentRatio)
    //   let spent11 = custom_step(11.0, spentRatio)
    //   let spent12 = custom_step(12.0, spentRatio)
    //   let spent13 = custom_step(13.0, spentRatio)
    //   let spent14 = custom_step(14.0, spentRatio)
    //   let spent15 = custom_step(15.0, spentRatio)
    //   let spent16 = custom_step(16.0, spentRatio)

    let wave = Math.sin(currentAngle * (1.0 + (custom_random(ANGULAR_FREQUENCY * 1.0) * health))) * spent1 +
              Math.sin(currentAngleMod * (2.0 + (custom_random(ANGULAR_FREQUENCY * 2.0) * health))) * spent2 +
              Math.sin(currentAngleMod * (3.0 + (custom_random(ANGULAR_FREQUENCY * 3.0) * health))) * spent3 +
              Math.sin(currentAngleMod * (4.0 + (custom_random(ANGULAR_FREQUENCY * 4.0) * health))) * spent4 +
              Math.sin(currentAngleMod * (5.0 + (custom_random(ANGULAR_FREQUENCY * 5.0) * health))) * spent5 +
              Math.sin(currentAngleMod * (6.0 + (custom_random(ANGULAR_FREQUENCY * 6.0) * health))) * spent6 +
              Math.sin(currentAngleMod * (7.0 + (custom_random(ANGULAR_FREQUENCY * 7.0) * health))) * spent7 +
              Math.sin(currentAngleMod * (8.0 + (custom_random(ANGULAR_FREQUENCY * 8.0) * health))) * spent8
    //   Math.sin(currentAngleMod * (9.0 + (custom_random(ANGULAR_FREQUENCY * 9.0) * health))) * spent9 +
    //   Math.sin(currentAngleMod * (10.0 + (custom_random(ANGULAR_FREQUENCY * 10.0) * health))) * spent10 +
    //   Math.sin(currentAngleMod * (11.0 + (custom_random(ANGULAR_FREQUENCY * 11.0) * health))) * spent11 +
    //   Math.sin(currentAngleMod * (12.0 + (custom_random(ANGULAR_FREQUENCY * 12.0) * health))) * spent12 +
    //   Math.sin(currentAngleMod * (13.0 + (custom_random(ANGULAR_FREQUENCY * 13.0) * health))) * spent13 +
    //   Math.sin(currentAngleMod * (14.0 + (custom_random(ANGULAR_FREQUENCY * 14.0) * health))) * spent14 +
    //   Math.sin(currentAngleMod * (15.0 + (custom_random(ANGULAR_FREQUENCY * 15.0) * health))) * spent15 +
    //   Math.sin(currentAngleMod * (16.0 + (custom_random(ANGULAR_FREQUENCY * 16.0) * health))) * spent16

    wave /= 8.0

    sum += wave * attack * release * vol
  }

  return sum
}, {loopMaxIterations: 2000}).setOutput([sampleRate * soundDuration])

sineBank.addNativeFunction('custom_smoothstep', `highp float custom_smoothstep(float edge0, float edge1, float x) {
    return smoothstep(edge0, edge1, x);
  }`)

sineBank.addNativeFunction('custom_step', `highp float custom_step(float edge, float x) {
    return step(edge, x);
  }`)

sineBank.addNativeFunction('custom_random', `highp float custom_random(float n){
    return fract(sin(n) * 43758.5453123);
  }`)

self.addEventListener('message', async function (e) {
  let data = e.data
  switch (data.cmd) {
    case 'get':

      const blockData = data.blockData
      const modes = data.modes
      const notes = data.notes

      console.time('audioGenerate')
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
      const txCount = blockData.tx.length

      for (let i = 0; i < txCount; i++) {
        const tx = blockData.tx[i]

        let txTime = map(i, 0, txCount, 0, 10)
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

      console.timeEnd('audioGenerate')

      let vol = getVol(frequencies.length > 2000 ? 2000 : txCount, soundDuration)

      console.time('sineBank')
      let sineArray = sineBank(frequencies, txTimes, spent, vol, health, 2000)
      console.timeEnd('sineBank')

      console.time('fillBuffer')
      let lArray = new Float32Array(sampleRate * soundDuration)
      let rArray = new Float32Array(sampleRate * soundDuration)
      for (let index = 0; index < sineArray.length; index++) {
        lArray[index] = sineArray[index]
        rArray[index] = sineArray[Math.floor(index * 0.99)] // right channel slightly out of phase with left for stereo effect
      }
      console.timeEnd('fillBuffer')

      let returnData = {
        lArray: lArray,
        rArray: rArray
      }

      self.postMessage(returnData)
      break
    case 'stop':
      self.postMessage('WORKER STOPPED')
      self.close()
      break
    default:
      self.postMessage('Unknown command')
  }

  self.postMessage(e.data)
}, false)

const getVol = function (frequencies, soundDuration) {
  let noteLength = 3.0
  let vol = (soundDuration / noteLength) / frequencies

  return vol
}
