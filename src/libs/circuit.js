// libs
import * as THREE from 'three'

import EventEmitter from 'eventemitter3'

import MerkleTools from '../utils/merkleTools'

import CircuitWorker from '../workers/circuit.worker.js'

export default class Circuit extends EventEmitter {
  constructor (args) {
    super(args)

    this.FBStorageCircuitRef = args.FBStorageCircuitRef
    this.config = args.config

    this.merkleTools = new MerkleTools()

    this.offscreenMode = false

    // use OffscreenCanvas if available
    if (typeof window.OffscreenCanvas !== 'undefined') {
      this.offscreenMode = true
    }

    this.textureLoader = new THREE.TextureLoader()

    this.canvas = null
  }

  async draw (nTX, closestBlock, closestBlockOffsets) {
    return new Promise((resolve, reject) => {
      let that = this

      if (!this.offscreenMode) {
        if (this.canvas && this.canvas.parentNode) {
          this.canvas.parentNode.removeChild(this.canvas)
        }

        let oldCanvas = document.getElementById('sketchboard')
        if (oldCanvas) {
          oldCanvas.remove()
        }
      }

      // check storage
      let existingCanvasRef = this.FBStorageCircuitRef.child(closestBlock.blockData.hash + '.png')

      // Create a reference from a Google Cloud Storage URI
      existingCanvasRef.getDownloadURL().then(function (url) {
        that.textureLoader.load(url, resolve)
      }).catch(function () {
        resolve()

        /*
        if (this.offscreenMode) {
          const circuitWorker = new CircuitWorker()
          circuitWorker.onmessage = async ({ data }) => {
            if (typeof data.complete !== 'undefined' && data.complete === true) {
              existingCanvasRef.getDownloadURL().then(function (url) {
                circuitWorker.terminate()
                that.textureLoader.load(url, resolve)
              })
            }
          }
          circuitWorker.postMessage({ cmd: 'get', nTX: nTX, closestBlock: closestBlock, config: this.config, closestBlockOffsets: closestBlockOffsets })
        } else {
          this.canvas = document.createElement('canvas')
          this.canvas.setAttribute('id', 'sketchboard')
          document.getElementsByTagName('body')[0].appendChild(this.canvas)

          let canvasSize = 1024
          this.canvas.width = canvasSize
          this.canvas.height = canvasSize

          this.merkleTools.drawMerkleCanvas(this.canvas, closestBlock, nTX, canvasSize, closestBlockOffsets)

          this.canvas.toBlob((blob) => {
            let canvasRef = this.FBStorageCircuitRef.child(closestBlock.blockData.hash + '.png')
            try {
              canvasRef.put(blob).then(function (snapshot) {
                that.textureLoader.load(this.canvas, resolve)
              }.bind(this))
            } catch (error) {
              console.log(error)
            }
          })
        } */
      })
    })
  }
}
