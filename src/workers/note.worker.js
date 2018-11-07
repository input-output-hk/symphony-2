import GPU from 'gpu.js'
import AudioUtils from '../libs/audio/audioUtils'

self.addEventListener('message', async function (e) {
  let data = e.data
  switch (data.cmd) {
    case 'get':

      const blockAudioData = data.blockAudioData
      const txID = data.txID
      const sampleRate = data.sampleRate
      const soundDuration = data.soundDuration
      const noteDuration = data.noteDuration

      const frequency = blockAudioData.frequencies[txID - 1]
      const spent = blockAudioData.spent[txID - 1]
      const health = blockAudioData.health

      const audioUtils = new AudioUtils({
        sampleRate: sampleRate,
        soundDuration: soundDuration,
        noteDuration: noteDuration
      })

      const gpu = new GPU()

      const txAudio = gpu.createKernel(audioUtils.txAudio, {loopMaxIterations: 1}).setOutput([
        Math.floor(
          sampleRate * noteDuration
        )
      ])

      txAudio.addNativeFunction('custom_smoothstep', audioUtils.customSmoothstep)
      txAudio.addNativeFunction('custom_step', audioUtils.customStep)
      txAudio.addNativeFunction('custom_random', audioUtils.customRandom)

      let sineArray = txAudio(
        frequency,
        spent,
        health,
        sampleRate
      )

      let arrayBuffers = audioUtils.fillBuffer(sineArray, 0.3, noteDuration)

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
