
import * as THREE from 'three'

export default class MerkleTools {
  getMerklePositions (nTX) {
    nTX--
    nTX |= nTX >> 1
    nTX |= nTX >> 2
    nTX |= nTX >> 4
    nTX |= nTX >> 8
    nTX |= nTX >> 16
    nTX++

    let merkleMap = {
      4096: 13,
      2048: 12,
      1024: 11,
      512: 10,
      256: 9,
      128: 8,
      64: 7,
      32: 6,
      16: 5,
      8: 4,
      4: 3,
      2: 2,
      1: 1,
      0: 1
    }

    let merkleLineWidthMap = {
      4096: 0.4,
      2048: 0.525,
      1024: 0.65,
      512: 1.15,
      256: 0.9,
      128: 1.15,
      64: 1.4,
      32: 2.4,
      16: 2.9,
      8: 3.4,
      4: 4.025,
      2: 4.4,
      1: 4.9,
      0: 4.9
    }

    let merkleNodeRadiusMap = {
      4096: 1.5,
      2048: 1.25,
      1024: 1.325,
      512: 1.325,
      256: 2.2,
      128: 2.95,
      64: 3.45,
      32: 3.95,
      16: 4.45,
      8: 4.9,
      4: 5.2,
      2: 6.95,
      1: 6.9,
      0: 6.9
    }

    const merkleLineWidth = merkleLineWidthMap[nTX] * 0.5
    const merkleNodeRadius = merkleNodeRadiusMap[nTX] * 0.5

    let positions = require('../data/merkle-' + merkleMap[nTX])

    return {
      merkleLineWidth: merkleLineWidth,
      merkleNodeRadius: merkleNodeRadius,
      positions: positions
    }
  }

  drawMerkleCanvas (canvas, closestBlock, nTX, canvasSize) {
    let context = canvas.getContext('2d')

    const merkleData = this.getMerklePositions(nTX)
    let merklePositions = merkleData.positions

    let canvasOffset = canvasSize * 0.5
    let scaleFactor = 2.0075

    let offsetStack = Array.from(closestBlock.offsets)

    for (let index = 0; index < nTX * 2; index += 2) {
      const merkleX = merklePositions[index + 0]
      const merkleZ = merklePositions[index + 1]

      let merkleVec = new THREE.Vector2(merkleX, merkleZ)

      // find closest crystal position
      let closestDist = Number.MAX_SAFE_INTEGER
      let closestDistIndexes = []
      for (let oIndex = 0; oIndex < offsetStack.length; oIndex += 2) {
        let offsetX = offsetStack[oIndex + 0]
        let offsetZ = offsetStack[oIndex + 1]

        if (offsetX === 0 && offsetZ === 0) {
          continue
        }

        const oElement = new THREE.Vector2(offsetX, offsetZ)
        let distSq = oElement.distanceToSquared(merkleVec)

        if (distSq < closestDist) {
          closestDist = distSq
          closestDistIndexes = [oIndex + 0, oIndex + 1]
        }
      }

      if (closestDistIndexes.length && typeof offsetStack[closestDistIndexes[0]] !== 'undefined') {
        let closestOffsetPointX = offsetStack[closestDistIndexes[0]]
        let closestOffsetPointZ = offsetStack[closestDistIndexes[1]]

        offsetStack.splice(closestDistIndexes[0], 1)
        offsetStack.splice(closestDistIndexes[0], 1)

        let scaledOffsetX = closestOffsetPointX * scaleFactor + canvasOffset
        let scaledOffsetZ = closestOffsetPointZ * scaleFactor + canvasOffset

        let scaledMerkleX = merkleX * scaleFactor + canvasOffset
        let scaledMerkleZ = merkleZ * scaleFactor + canvasOffset

        let xEdge = scaledOffsetX - scaledMerkleX
        let zEdge = scaledOffsetZ - scaledMerkleZ
        let shortestEdgeLength = 0
        let shortestEdge = 'X'

        if (Math.abs(xEdge) < Math.abs(zEdge)) {
          shortestEdgeLength = xEdge
        } else {
          shortestEdgeLength = zEdge
          shortestEdge = 'Z'
        }

        let remove = shortestEdgeLength * 0.5

        context.shadowBlur = 25
        context.shadowColor = 'white'

        context.beginPath()
        context.moveTo(scaledMerkleX, scaledMerkleZ)
        context.lineWidth = merkleData.merkleLineWidth
        context.strokeStyle = 'rgba(255,255,255,0.50)'

        if (shortestEdge === 'X') {
          context.lineTo(
            scaledOffsetX - remove,
            scaledMerkleZ
          )

          if (zEdge < 0) {
            remove = Math.abs(remove) * -1
          } else {
            remove = Math.abs(remove)
          }

          context.lineTo(
            scaledOffsetX,
            scaledMerkleZ + remove
          )
          context.lineTo(
            scaledOffsetX,
            scaledOffsetZ
          )
        } else {
          context.lineTo(
            scaledMerkleX,
            scaledOffsetZ - remove
          )

          if (xEdge < 0) {
            remove = Math.abs(remove) * -1
          } else {
            remove = Math.abs(remove)
          }

          context.lineTo(
            scaledMerkleX + remove,
            scaledOffsetZ
          )
          context.lineTo(
            scaledOffsetX,
            scaledOffsetZ
          )
        }
        context.lineJoin = 'round'
        context.stroke()

        context.beginPath()
        context.strokeStyle = 'rgba(255,255,255,0.50)'
        context.arc(scaledMerkleX, scaledMerkleZ, merkleData.merkleNodeRadius, 0, 2 * Math.PI, false)
        context.lineWidth = merkleData.merkleLineWidth + 1.0

        context.stroke()

        context.beginPath()
        context.strokeStyle = 'rgba(255,255,255,0.40)'
        context.arc(scaledOffsetX, scaledOffsetZ, merkleData.merkleNodeRadius, 0, 2 * Math.PI, false)

        context.stroke()
      }
    }

    context.translate(canvas.width / 2, canvas.height / 2)
    context.scale(-1, 1)
    context.font = '12.5pt Calibri'
    context.lineWidth = 0
    context.fillStyle = 'rgba(255,255,255,0.50)'
    context.fillText('BLOCK #' + closestBlock.blockData.height + '  HASH: ' + closestBlock.blockData.hash, -1000, -990)
    context.scale(-1, 1)

    context.rotate(Math.PI / 6)
  }
}
