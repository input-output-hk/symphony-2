import EventEmitter from 'eventemitter3'
import GPU from 'gpu.js'
import AudioUtils from './audioUtils'
import * as ArrayUtils from '../../utils/array'

import AudioWorker from '../../workers/audio.worker.js'
import NoteWorker from '../../workers/note.worker.js'

export default class Audio extends EventEmitter {
  constructor (args) {
    super(args)

    this.sampleRate = args.sampleRate
    this.soundDuration = args.soundDuration
    this.noteDuration = args.noteDuration
    this.config = args.config

    this.narrationPlaying = false

    this.audioUtils = new AudioUtils({
      sampleRate: this.sampleRate,
      soundDuration: this.soundDuration,
      noteDuration: this.noteDuration,
      config: this.config
    })

    this.gpu = new GPU()
    let Ctx = window.AudioContext || window.webkitAudioContext
    this.audioContext = new Ctx()
    this.blockAudioBus = this.audioContext.createGain()
    this.masterBus = this.audioContext.createGain()

    this.masterBus.gain.setTargetAtTime(0.8, this.audioContext.currentTime, 0.0)

    this.compressor = this.audioContext.createDynamicsCompressor()
    this.compressor.threshold.setValueAtTime(-10, this.audioContext.currentTime)
    this.compressor.knee.setValueAtTime(0, this.audioContext.currentTime)
    this.compressor.ratio.setValueAtTime(5, this.audioContext.currentTime)
    this.compressor.attack.setValueAtTime(0, this.audioContext.currentTime)
    this.compressor.release.setValueAtTime(1.0, this.audioContext.currentTime)

    this.biquadFilter = this.audioContext.createBiquadFilter()
    this.biquadFilter.type = 'notch'
    this.biquadFilter.frequency.setValueAtTime(800, this.audioContext.currentTime)
    this.biquadFilter.gain.setValueAtTime(-8.0, this.audioContext.currentTime)
    this.biquadFilter.Q.setValueAtTime(0.7, this.audioContext.currentTime)

    this.biquadFilter2 = this.audioContext.createBiquadFilter()
    this.biquadFilter2.type = 'notch'
    this.biquadFilter2.frequency.setValueAtTime(188, this.audioContext.currentTime)
    this.biquadFilter2.gain.setValueAtTime(-10.0, this.audioContext.currentTime)
    this.biquadFilter2.Q.setValueAtTime(3.0, this.audioContext.currentTime)

    this.highShelf = this.audioContext.createBiquadFilter()
    this.highShelf.type = 'highshelf'
    this.highShelf.gain.setValueAtTime(-7.0, this.audioContext.currentTime)
    this.highShelf.frequency.setValueAtTime(1200, this.audioContext.currentTime)

    const getImpulseBuffer = (audioContext, impulseUrl) => {
      return window.fetch(impulseUrl)
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
    }

    this.convolver = this.audioContext.createConvolver()
    this.convolver2 = this.audioContext.createConvolver()

    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 1024

    let SlapbackDelayNode = function (audioContext) {
      this.input = audioContext.createGain()
      let output = audioContext.createGain()
      let delay = audioContext.createDelay()
      let feedback = audioContext.createGain()
      let wetLevel = audioContext.createGain()

      delay.delayTime.value = 1.0
      feedback.gain.value = 0.4
      wetLevel.gain.value = 0.4

      this.input.connect(delay)
      this.input.connect(output)
      delay.connect(feedback)
      delay.connect(wetLevel)
      feedback.connect(delay)
      wetLevel.connect(output)

      this.connect = function (target) {
        output.connect(target)
      }
    }

    let delay = new SlapbackDelayNode(this.audioContext)

    this.analyserGain = this.audioContext.createGain()
    this.analyserGain.gain.setTargetAtTime(4.0, this.audioContext.currentTime, 0.0)

    getImpulseBuffer(this.audioContext, './assets/sounds/IR/LittlefieldLobby.wav').then((buffer) => {
      this.convolver.buffer = buffer
      this.blockAudioBus.connect(this.masterBus)
      this.masterBus.connect(delay.input)

      delay.connect(this.convolver)

      this.convolver.connect(this.compressor)
      this.compressor.connect(this.biquadFilter)

      this.biquadFilter.connect(this.highShelf)

      this.masterBus.connect(this.analyserGain)
      this.analyserGain.connect(this.analyser)

      this.highShelf.connect(this.audioContext.destination)
    })

    getImpulseBuffer(this.audioContext, './assets/sounds/IR/Space4ArtGallery.wav').then((buffer) => {
      this.convolver2.buffer = buffer
      this.convolver2.connect(this.audioContext.destination)
    })

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

    this.chords = {
      'A#': [
        'A#',
        'D',
        'F'
      ],
      'F': [
        'F',
        'A',
        'C'
      ],
      'F#M': [
        'G',
        'A#',
        'D'
      ],
      'C#M': [
        'D',
        'F',
        'A'
      ],
      'D#': [
        'D#',
        'G',
        'A#'
      ]
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
      // 'aeolian': [
      //   'C',
      //   'D',
      //   'D#',
      //   'F',
      //   'G',
      //   'G#',
      //   'A#',
      //   'C'
      // ],
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
    this.buffers = {}
    this.noteBuffers = {}
    this.gainNodes = {}
    this.audioSources = {}
    this.noteSources = {}
    this.loops = {}

    this.blockAudioData = {}

    // use OffscreenCanvas if available
    this.offscreenMode = typeof window.OffscreenCanvas !== 'undefined'

    this.narrationFilePath = 'assets/sounds/narration/'
    this.narrationSource = null

    this.audioFilePath = 'assets/sounds/'
    this.loadedAudioSources = {}
  }

  startAudio (blockData, arrayBuffers) {
    this.buffers[blockData.height].copyToChannel(arrayBuffers.lArray, 0)
    this.buffers[blockData.height].copyToChannel(arrayBuffers.rArray, 1)

    this.audioSources[blockData.height] = this.audioContext.createBufferSource()
    this.audioSources[blockData.height].buffer = this.buffers[blockData.height]

    this.gainNodes[blockData.height] = this.audioContext.createGain()

    this.audioSources[blockData.height].connect(this.gainNodes[blockData.height])

    this.gainNodes[blockData.height].connect(this.blockAudioBus)

    this.audioSources[blockData.height].loop = true

    this.loops[blockData.height] = () => {
      setTimeout(function () {
        this.emit('loopend', blockData)
        this.loops[blockData.height](blockData)
      }.bind(this), this.soundDuration * 1000)
    }

    this.loops[blockData.height](blockData)

    this.fadeInBlockAudio()

    this.audioSources[blockData.height].start()
  }

  generate (blockData, TXValues, spentRatios) {
    this.buffers[blockData.height] = this.audioContext.createBuffer(2, this.sampleRate * this.soundDuration, this.sampleRate)

    if (this.offscreenMode) {
      const audioWorker = new AudioWorker()
      audioWorker.onmessage = async ({ data }) => {
        if (typeof data.lArray !== 'undefined') {
          this.blockAudioData[blockData.height] = data.blockAudio

          audioWorker.terminate()
          return this.startAudio(blockData, data)
        }
      }

      let sendObj = {
        cmd: 'get',
        blockData: blockData,
        config: this.config,
        chords: this.chords,
        notes: this.notes,
        sampleRate: this.sampleRate,
        soundDuration: this.soundDuration,
        TXValues: TXValues,
        spentRatios: spentRatios,
        lArray: new Float32Array(this.sampleRate * this.soundDuration),
        rArray: new Float32Array(this.sampleRate * this.soundDuration)
      }

      audioWorker.postMessage(sendObj, [
        sendObj.TXValues.buffer,
        sendObj.spentRatios.buffer,
        sendObj.lArray.buffer,
        sendObj.rArray.buffer
      ])
    } else {
      const blockAudio = this.audioUtils.generateBlockAudio(blockData, this.chords, this.notes, TXValues, spentRatios)

      let parts = 15

      const gpu = new GPU()

      const txCount = blockAudio.frequencies.length > this.config.audio.maxSineBankLoops ? this.config.audio.maxSineBankLoops : blockAudio.frequencies.length

      let simultaneousFrequencies = txCount / parts

      let audioChunkTime = (this.soundDuration / parts)

      const sineBank = gpu.createKernel(this.audioUtils.sineBank, {loopMaxIterations: this.config.audio.maxSineBankLoops}).setOutput([
        Math.floor(
          this.sampleRate * audioChunkTime
        )
      ])
      sineBank.addNativeFunction('custom_smoothstep', this.audioUtils.customSmoothstep)
      sineBank.addNativeFunction('custom_step', this.audioUtils.customStep)
      sineBank.addNativeFunction('custom_random', this.audioUtils.customRandom)

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
          this.sampleRate,
          i * audioChunkTime,
          startIndex
        )

        sineArrayChunks.push(sineArray)
        i++
      }

      let concatArrays = ArrayUtils.concatenate(sineArrayChunks)

      let lArray = new Float32Array(this.sampleRate * this.soundDuration)
      let rArray = new Float32Array(this.sampleRate * this.soundDuration)

      this.audioUtils.fillBuffer(concatArrays, 1.0, lArray, rArray)

      blockAudio.txTimes = []
      blockAudio.spent = []

      let data = {
        lArray: lArray,
        rArray: rArray,
        blockAudio: blockAudio
      }

      return this.startAudio(blockData, data)
    }
  }

  playNote (blockData, txID) {
    if (typeof this.blockAudioData[blockData.height] === 'undefined') {
      return
    }

    if (this.offscreenMode) {
      const noteWorker = new NoteWorker()
      noteWorker.onmessage = async ({ data }) => {
        if (typeof data.lArray !== 'undefined') {
          noteWorker.terminate()
          return this.startNote(blockData, data)
        }
      }

      noteWorker.postMessage({
        cmd: 'get',
        blockAudioData: this.blockAudioData[blockData.height],
        txID: txID,
        sampleRate: this.sampleRate,
        soundDuration: this.soundDuration,
        noteDuration: this.noteDuration
      })
    }
  }

  fadeOutBlockAudio () {
    this.blockAudioBus.gain.setTargetAtTime(0.0, this.audioContext.currentTime, 2)
  }

  fadeInBlockAudio () {
    this.blockAudioBus.gain.setTargetAtTime(1.0, this.audioContext.currentTime, 2)
  }

  stopNotes () {
    this.blockAudioBus.gain.setTargetAtTime(1.0, this.audioContext.currentTime, 3)

    Object.keys(this.noteSources).forEach((i) => {
      this.noteSources[i].stop()
    })

    this.noteSources = []
    this.noteBuffers = []
  }

  startNote (blockData, arrayBuffers) {
    this.stopNotes()

    this.noteBuffers[blockData.height] = this.audioContext.createBuffer(2, this.sampleRate * this.noteDuration, this.sampleRate)

    const buffer = this.noteBuffers[blockData.height]

    console.time('fillBuffer')

    let lArray = buffer.getChannelData(0)
    let rArray = buffer.getChannelData(1)
    for (let index = 0; index < arrayBuffers.lArray.length; index++) {
      lArray[index] = arrayBuffers.lArray[index]
      rArray[index] = arrayBuffers.rArray[index]
    }
    console.timeEnd('fillBuffer')

    this.noteSources[blockData.height] = this.audioContext.createBufferSource()

    let noteSource = this.noteSources[blockData.height]

    noteSource.buffer = buffer

    const gainNode = this.audioContext.createGain()

    this.blockAudioBus.gain.setTargetAtTime(0.1, this.audioContext.currentTime, 1)

    noteSource.connect(gainNode)

    gainNode.connect(this.masterBus)

    noteSource.loop = true

    noteSource.start()
  }

  /**
   * Play a narration file
   *
   * @param {string} group
   * @param {string} index
   * @param {int} delay in ms
   *
   * @returns Promise
   */
  async playNarrationFile (group, index, delay = 2000) {
    return new Promise(async (resolve) => {
      if (!this.narrationPlaying) {
        this.narrationPlaying = true

        let path = this.narrationFilePath + group + '/' + index + '.mp3'

        let response = await window.fetch(path)
        let arrayBuffer = await response.arrayBuffer()
        let audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)

        this.narrationSource = this.audioContext.createBufferSource()
        this.narrationSource.buffer = audioBuffer

        // source.connect(this.convolver2)

        this.narrationSource.connect(this.audioContext.destination)

        this.narrationSource.start()

        this.narrationSource.onended = async (e) => {
          setTimeout(() => {
            this.narrationPlaying = false
            resolve(true)
          }, delay)
        }
      }
    })
  }

  /**
   * Play audio file
   *
   * @returns Promise
   */
  async playAudioFile (filePath, loop = false) {
    return new Promise(async (resolve) => {
      let path = this.audioFilePath + filePath + '.mp3'

      let response = await window.fetch(path)
      let arrayBuffer = await response.arrayBuffer()
      let audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)
      let source = this.audioContext.createBufferSource()
      source.buffer = audioBuffer

      const gainNode = this.audioContext.createGain()
      gainNode.gain.value = 0.3
      gainNode.connect(this.audioContext.destination)

      if (loop) {
        source.loop = true
      }
      source.connect(gainNode)
      source.start()
    })
  }

  stopNarration () {
    if (!this.narrationPlaying) {
      return
    }

    this.narrationSource.stop()
  }
}
