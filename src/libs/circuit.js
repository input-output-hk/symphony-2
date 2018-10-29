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

    this.canvas = null
  }

  async draw (nTX, closestBlock) {
    return new Promise((resolve, reject) => {
      if (this.canvas && this.canvas.parentNode) {
        this.canvas.parentNode.removeChild(this.canvas)
      }

      let oldCanvas = document.getElementById('sketchboard')
      if (oldCanvas) {
        oldCanvas.remove()
      }

      // check storage
      let existingCanvasRef = this.FBStorageCircuitRef.child(closestBlock.blockData.hash + '.png')

      // Create a reference from a Google Cloud Storage URI
      existingCanvasRef.getDownloadURL().then(function (url) {
        console.log(url)
        let texture = new THREE.TextureLoader().load(url)
        resolve(texture)
      }).catch(function (error) {
        let msg = error

        if (this.offscreenMode) {
          const nearestBlocksWorker = new CircuitWorker()
          nearestBlocksWorker.onmessage = async ({ data }) => {
            if (typeof data.complete !== 'undefined' && data.complete === true) {
              existingCanvasRef.getDownloadURL().then(function (url) {
                let texture = new THREE.TextureLoader().load(url)
                resolve(texture)
              })
            }
            nearestBlocksWorker.terminate()
          }
          nearestBlocksWorker.postMessage({ cmd: 'get', nTX: nTX, closestBlock: closestBlock, config: this.config })
        } else {
          this.canvas = document.createElement('canvas')
          this.canvas.setAttribute('id', 'sketchboard')
          document.getElementsByTagName('body')[0].appendChild(this.canvas)

          let canvasSize = 2048
          this.canvas.width = canvasSize
          this.canvas.height = canvasSize

          this.merkleTools.drawMerkleCanvas(this.canvas, closestBlock, nTX, canvasSize)

          this.canvas.toBlob((blob) => {
            let canvasRef = this.FBStorageCircuitRef.child(closestBlock.blockData.hash + '.png')
            try {
              canvasRef.put(blob).then(function (snapshot) {
                let texture = new THREE.Texture(this.canvas)
                
                resolve(texture)
              }.bind(this))
            } catch (error) {
              console.log(error)
            }
          })
        }
      }.bind(this))
    })
  }
}
