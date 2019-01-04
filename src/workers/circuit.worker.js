import firebase from 'firebase/app'
import 'firebase/firestore'
import 'firebase/storage'

import MerkleTools from '../utils/merkleTools'

const merkleTools = new MerkleTools()

self.addEventListener('message', async function (e) {
  let data = e.data
  switch (data.cmd) {
    case 'get':

      firebase.initializeApp(data.config.fireBase)

      const settings = {timestampsInSnapshots: true}
      firebase.firestore().settings(settings)
      const FBStorage = firebase.storage()
      const FBStorageRef = FBStorage.ref()
      const FBStorageCircuitRef = FBStorageRef.child('bitcoin_circuits')

      const nTX = data.nTX
      const closestBlock = data.closestBlock

      let canvasSize = 1024
      let canvas = new OffscreenCanvas(canvasSize, canvasSize)

      merkleTools.drawMerkleCanvas(canvas, closestBlock, nTX, canvasSize)

      let blob = null
      if (typeof canvas.convertToBlob !== 'undefined') {
        blob = await canvas.convertToBlob()
      } else if (typeof canvas.toBlob !== 'undefined') {
        blob = await canvas.toBlob()
      }

      let canvasRef = FBStorageCircuitRef.child(closestBlock.blockData.hash + '.png')

      let complete = false

      try {
        await canvasRef.put(blob)
        complete = true
      } catch (error) {
        complete = false
      }

      let returnData = {
        complete: complete
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
