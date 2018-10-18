import firebase from 'firebase/app'
import 'firebase/firestore'
import 'firebase/storage'
import * as THREE from 'three'

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

      let canvasSize = 2048
      let canvas = new OffscreenCanvas(canvasSize, canvasSize)

      merkleTools.drawMerkleCanvas(canvas, closestBlock, nTX, canvasSize)

      // let context = canvas.getContext('2d')

      // const merkleData = merkleTools.getMerklePositions(nTX)
      // let merklePositions = merkleData.positions

      // let canvasOffset = canvasSize * 0.5
      // let scaleFactor = 4.015

      // let offsetStack = Array.from(closestBlock.offsets)

      // for (let index = 0; index < nTX * 2; index += 2) {
      //   const merkleX = merklePositions[index + 0]
      //   const merkleZ = merklePositions[index + 1]

      //   let merkleVec = new THREE.Vector2(merkleX, merkleZ)

      //   // find closest crystal position
      //   let closestDist = Number.MAX_SAFE_INTEGER
      //   let closestDistIndexes = []
      //   for (let oIndex = 0; oIndex < offsetStack.length; oIndex += 2) {
      //     let offsetX = offsetStack[oIndex + 0]
      //     let offsetZ = offsetStack[oIndex + 1]

      //     if (offsetX === 0 && offsetZ === 0) {
      //       continue
      //     }

      //     const oElement = new THREE.Vector2(offsetX, offsetZ)
      //     let distSq = oElement.distanceToSquared(merkleVec)

      //     if (distSq < closestDist) {
      //       closestDist = distSq
      //       closestDistIndexes = [oIndex + 0, oIndex + 1]
      //     }
      //   }

      //   if (closestDistIndexes.length && typeof offsetStack[closestDistIndexes[0]] !== 'undefined') {
      //     let closestOffsetPointX = offsetStack[closestDistIndexes[0]]
      //     let closestOffsetPointZ = offsetStack[closestDistIndexes[1]]

      //     offsetStack.splice(closestDistIndexes[0], 1)
      //     offsetStack.splice(closestDistIndexes[0], 1)

      //     let scaledOffsetX = closestOffsetPointX * scaleFactor + canvasOffset
      //     let scaledOffsetZ = closestOffsetPointZ * scaleFactor + canvasOffset

      //     let scaledMerkleX = merkleX * scaleFactor + canvasOffset
      //     let scaledMerkleZ = merkleZ * scaleFactor + canvasOffset

      //     let xEdge = scaledOffsetX - scaledMerkleX
      //     let zEdge = scaledOffsetZ - scaledMerkleZ
      //     let shortestEdgeLength = 0
      //     let shortestEdge = 'X'

      //     if (Math.abs(xEdge) < Math.abs(zEdge)) {
      //       shortestEdgeLength = xEdge
      //     } else {
      //       shortestEdgeLength = zEdge
      //       shortestEdge = 'Z'
      //     }

      //     let remove = shortestEdgeLength * 0.5

      //     context.shadowBlur = 25
      //     context.shadowColor = 'white'

      //     context.beginPath()
      //     context.moveTo(scaledMerkleX, scaledMerkleZ)
      //     context.lineWidth = merkleData.merkleLineWidth
      //     context.strokeStyle = 'rgba(255,255,255,0.50)'

      //     if (shortestEdge === 'X') {
      //       context.lineTo(
      //         scaledOffsetX - remove,
      //         scaledMerkleZ
      //       )

      //       if (zEdge < 0) {
      //         remove = Math.abs(remove) * -1
      //       } else {
      //         remove = Math.abs(remove)
      //       }

      //       context.lineTo(
      //         scaledOffsetX,
      //         scaledMerkleZ + remove
      //       )
      //       context.lineTo(
      //         scaledOffsetX,
      //         scaledOffsetZ
      //       )
      //     } else {
      //       context.lineTo(
      //         scaledMerkleX,
      //         scaledOffsetZ - remove
      //       )

      //       if (xEdge < 0) {
      //         remove = Math.abs(remove) * -1
      //       } else {
      //         remove = Math.abs(remove)
      //       }

      //       context.lineTo(
      //         scaledMerkleX + remove,
      //         scaledOffsetZ
      //       )
      //       context.lineTo(
      //         scaledOffsetX,
      //         scaledOffsetZ
      //       )
      //     }
      //     context.lineJoin = 'round'
      //     context.stroke()

      //     context.beginPath()
      //     context.strokeStyle = 'rgba(255,255,255,0.50)'
      //     context.arc(scaledMerkleX, scaledMerkleZ, merkleData.merkleNodeRadius, 0, 2 * Math.PI, false)
      //     context.lineWidth = merkleData.merkleLineWidth + 1.0

      //     context.stroke()

      //     context.beginPath()
      //     context.strokeStyle = 'rgba(255,255,255,0.40)'
      //     context.arc(scaledOffsetX, scaledOffsetZ, merkleData.merkleNodeRadius, 0, 2 * Math.PI, false)

      //     context.stroke()
      //   }
      // }

      // context.translate(canvas.width / 2, canvas.height / 2)
      // context.scale(-1, 1)
      // context.font = '12.5pt Calibri'
      // context.lineWidth = 0
      // context.fillStyle = 'rgba(255,255,255,0.50)'
      // context.fillText('BLOCK #' + closestBlock.blockData.height + '  HASH: ' + closestBlock.blockData.hash, -1000, -990)
      // context.scale(-1, 1)

      // context.rotate(Math.PI / 6)

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
