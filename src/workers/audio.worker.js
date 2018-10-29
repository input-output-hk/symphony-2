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

      const audioUtils = new AudioUtils({sampleRate: sampleRate, soundDuration: soundDuration})

      const gpu = new GPU()

      const sineBank = gpu.createKernel(audioUtils.sineBank, {loopMaxIterations: 3000}).setOutput([sampleRate * soundDuration])
      sineBank.addNativeFunction('custom_smoothstep', audioUtils.customSmoothstep)
      sineBank.addNativeFunction('custom_step', audioUtils.customStep)
      sineBank.addNativeFunction('custom_random', audioUtils.customRandom)

      const blockAudio = audioUtils.generateBlockAudio(blockData, modes, notes)

      console.time('sineBank')
      let sineArray = sineBank(blockAudio.frequencies, blockAudio.txTimes, blockAudio.spent, blockAudio.health, blockAudio.frequencies.length, sampleRate)
      console.timeEnd('sineBank')

      let arrayBuffers = audioUtils.fillBuffer(sineArray)

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
