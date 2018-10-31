import GPU from 'gpu.js'
import AudioUtils from '../libs/audio/audioUtils'

self.addEventListener('message', async function (e) {
  let data = e.data
  switch (data.cmd) {
    case 'get':

      const blockData = data.blockData
      const modes = data.modes
      const notes = data.notes
      const sampleRate = data.sampleRate
      const soundDuration = data.soundDuration

      const audioUtils = new AudioUtils({
        sampleRate: sampleRate,
        soundDuration: soundDuration
      })

      const blockAudio = audioUtils.generateBlockAudio(blockData, modes, notes)

      let chunkSize = 200

      const gpu = new GPU()

      console.time('sineBank')

      let frequencyTotalChunk = Math.ceil(
        (blockAudio.frequencies.length / chunkSize)
      )

      let simultaneousFrequencies = blockAudio.frequencies.length / frequencyTotalChunk

      let audioChunkTime = Math.floor(
        (soundDuration / frequencyTotalChunk)
      )

      const sineBank = gpu.createKernel(audioUtils.sineBank, {loopMaxIterations: 1500}).setOutput([
        Math.floor(
          sampleRate * audioChunkTime
        )
      ])
      sineBank.addNativeFunction('custom_smoothstep', audioUtils.customSmoothstep)
      sineBank.addNativeFunction('custom_step', audioUtils.customStep)
      sineBank.addNativeFunction('custom_random', audioUtils.customRandom)

      let sineArrayChunks = []

      let i = 0
      for (let index = 0; index < blockAudio.frequencies.length; index += chunkSize) {
        let startIndex = Math.floor(index - (simultaneousFrequencies * 3.0))
        if (startIndex < 0) {
          startIndex = 0
        }

        // startIndex = 0
        console.log(startIndex)

        let sineArray = sineBank(
          blockAudio.frequencies,
          blockAudio.txTimes,
          blockAudio.spent,
          blockAudio.health,
          blockAudio.frequencies.length > 1500 ? 1500 : blockAudio.frequencies.length,
          sampleRate,
          i * audioChunkTime,
          startIndex
        )

        sineArrayChunks.push(sineArray)
        i++
      }

      console.timeEnd('sineBank')

      let concatArrays = concatenate(sineArrayChunks)

      let arrayBuffers = audioUtils.fillBuffer(concatArrays)

      let returnData = {
        lArray: arrayBuffers.lArray,
        rArray: arrayBuffers.rArray
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

const concatenate = function (arrays) {
  let totalLength = 0
  arrays.forEach(arr => {
    totalLength += arr.length
  })

  let result = new Float32Array(totalLength)
  let offset = 0
  arrays.forEach(arr => {
    result.set(arr, offset)
    offset += arr.length
  })
  return result
}
