import * as THREE from 'three'

export default class TextureHelper {
  constructor () {
    this.positionTexture = null
  }

  setNodeCount (nodeCount) {
    this.nodeCount = nodeCount
  }

  setTextureSize (nodeCount) {
    this.setNodeCount(nodeCount)

    let width = 1
    let height = 1

    while (height * width < this.nodeCount) {
      width *= 2
      if (height * width >= this.nodeCount) {
        break
      }
      height *= 2
    }

    this.textureWidth = width
    this.textureHeight = height
  }

  getNodeTextureLocation (nodeID) {
    return {
      x: (nodeID % this.textureWidth) * (1 / this.textureWidth) + (1 / (this.textureWidth * 2)),
      y: Math.floor(nodeID / this.textureWidth) * (1 / this.textureHeight) + (1 / (this.textureHeight * 2))
    }
  }

  createPositionTexture ({
    defaultPositions = new Float32Array()
  } = {}) {
    let textureArray = new Float32Array(this.textureWidth * this.textureHeight * 4)
    for (let i = 0; i < this.nodeCount; i++) {
      let location = new THREE.Vector3(
        Math.random() * 1,
        Math.random() * 1,
        Math.random() * 1
      )

      location = location.normalize().multiplyScalar(Math.random() * 10)

      let lifeDuration = 250

      textureArray[i * 4 + 0] = location.x
      textureArray[i * 4 + 1] = location.y
      textureArray[i * 4 + 2] = location.z
      textureArray[i * 4 + 3] = Math.random() * lifeDuration
    }

    if (defaultPositions.length) {
      for (let index = 0; index < defaultPositions.length; index++) {
        textureArray[index] = defaultPositions[index]
      }
    }

    this.positionTexture = new THREE.DataTexture(
      textureArray,
      this.textureWidth,
      this.textureHeight,
      THREE.RGBAFormat,
      THREE.FloatType
    )
    this.positionTexture.minFilter = THREE.NearestFilter
    this.positionTexture.magFilter = THREE.NearestFilter
    this.positionTexture.generateMipmaps = false
    this.positionTexture.flipY = false
    this.positionTexture.needsUpdate = true

    return this.positionTexture
  }
}
