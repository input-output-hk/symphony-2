import GPU from 'gpu.js'
import AudioUtils from '../libs/audio/audioUtils'
import * as ArrayUtils from '../utils/array'

self.addEventListener('message', async function (e) {
  let data = e.data
  switch (data.cmd) {
    case 'get':

      const blockData = data.blockData
      const config = data.config
      const modes = data.modes
      const notes = data.notes
      const sampleRate = data.sampleRate
      const soundDuration = data.soundDuration

      const TXValues = data.TXValues
      const spentRatios = data.spentRatios

      const audioUtils = new AudioUtils({
        sampleRate: sampleRate,
        soundDuration: soundDuration,
        config: config
      })

      const blockAudio = audioUtils.generateBlockAudio(blockData, modes, notes, TXValues, spentRatios)

      let parts = 10

      const gpu = new GPU()

      const txCount = blockAudio.frequencies.length > config.audio.maxSineBankLoops ? config.audio.maxSineBankLoops : blockAudio.frequencies.length

      let simultaneousFrequencies = txCount / parts

      let audioChunkTime = (soundDuration / parts)

      const sineBank = gpu.createKernel(audioUtils.sineBank, {loopMaxIterations: config.audio.maxSineBankLoops}).setOutput([
        Math.floor(
          sampleRate * audioChunkTime
        )
      ])
      sineBank.addNativeFunction('custom_smoothstep', audioUtils.customSmoothstep)
      sineBank.addNativeFunction('custom_step', audioUtils.customStep)
      sineBank.addNativeFunction('custom_random', audioUtils.customRandom)

      let sineArrayChunks = []

      let i = 0
      for (let index = 0; index < parts; index++) {
        let startIndex = Math.floor(index * simultaneousFrequencies) - simultaneousFrequencies
        if (startIndex < 0) {
          startIndex = 0
        }

        let sineArray = sineBank(
          blockAudio.frequencies,
          blockAudio.txTimes,
          blockAudio.spent,
          blockAudio.health,
          txCount,
          sampleRate,
          i * audioChunkTime,
          startIndex
        )

        sineArrayChunks.push(sineArray)
        i++
      }

      let concatArrays = ArrayUtils.concatenate(sineArrayChunks)

      audioUtils.fillBuffer(concatArrays, 1.0, data.lArray, data.rArray)

      blockAudio.txTimes = []
      blockAudio.spent = []

      let returnData = {
        lArray: data.lArray,
        rArray: data.rArray,
        blockAudio: blockAudio
      }

      self.postMessage(returnData, [
        data.lArray.buffer,
        data.rArray.buffer
      ])
      break
    case 'stop':
      self.postMessage('WORKER STOPPED')
      self.close()
      break
    default:
      self.postMessage('Unknown command')
  }
}, false)
